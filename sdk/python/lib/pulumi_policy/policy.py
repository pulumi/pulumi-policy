# Copyright 2016-2020, Pulumi Corporation.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import asyncio
from concurrent import futures
import re
import sys
import time

from enum import Enum
from inspect import isawaitable
from typing import Any, Awaitable, Callable, Dict, Mapping, List, NamedTuple, Optional, Union, cast
from abc import ABC

import grpc
from google.protobuf import empty_pb2, json_format, struct_pb2
from pulumi.runtime import proto
from pulumi.runtime.proto import analyzer_pb2_grpc

from .deserialize import deserialize_properties
from .proxy import UnknownValueError, unknown_checking_proxy
from .version import SEMVERSION

_ONE_DAY_IN_SECONDS = 60 * 60 * 24

_POLICY_PACK_NAME_RE = re.compile("^[a-zA-Z0-9-_.]{1,100}$")

# _MAX_RPC_MESSAGE_SIZE raises the gRPC Max Message size from `4194304` (4mb) to `419430400` (400mb)
_MAX_RPC_MESSAGE_SIZE = 1024 * 1024 * 400
_GRPC_CHANNEL_OPTIONS = [("grpc.max_receive_message_length", _MAX_RPC_MESSAGE_SIZE)]

class PolicyPack:
    """
    A policy pack contains one or more policies to enforce.
    """

    def __init__(self,
                 name: str,
                 policies: List['Policy'],
                 enforcement_level: Optional['EnforcementLevel'] = None,
                 initial_config: Optional[Dict[str, Union['EnforcementLevel', Dict[str, Any]]]] = None) -> None:
        """
        :param str name: The name of the policy pack.
        :param List[Policy] policies: The policies associated with a policy pack.
        :param Optional[EnforcementLevel] enforcement_level: Indicates what to do on policy
               violation, e.g., block deployment but allow override with
               proper permissions. This is the default used for all policies in the policy pack.
               Individual policies can override.
        :param Optional[Dict[str, Union['EnforcementLevel', Dict[str, Any]]]] initial_config: Initial
               configuration for the policy pack. Allows specifying configuration programmatically from reusable
               policy libraries.
        """
        if not name:
            raise TypeError("Missing name argument")
        if not isinstance(name, str):
            raise TypeError("Expected name to be a string")
        if _POLICY_PACK_NAME_RE.match(name) is None:
            raise TypeError(f"Invalid policy pack name {name}. Policy pack names may only contain " +
                            "alphanumerics, hyphens, underscores, or periods.")
        if not policies:
            raise TypeError("Missing policies argument")
        if not isinstance(policies, list):
            raise TypeError("Expected policies to be a list of policies")
        for policy in policies:
            if not isinstance(policy, Policy):
                raise TypeError("Expected policies to be a list of policies")
        if enforcement_level is not None and not isinstance(enforcement_level, EnforcementLevel):
            raise TypeError(
                "Expected enforcement_level to be an EnforcementLevel")
        if initial_config is not None:
            if not isinstance(initial_config, dict):
                raise TypeError("Expected initial_config to be a dict")
            for k, v in initial_config.items():
                if not isinstance(k, str):
                    raise TypeError("Expected initial_config key to be a string")
                if not isinstance(v, EnforcementLevel) and not isinstance(v, dict):
                    raise TypeError(f"Expected initial_config['{k}'] to be an EnforcementLevel or dict")
                if isinstance(v, dict):
                    for vk in v:
                        if not isinstance(vk, str):
                            raise TypeError(f"Expected initial_config['{k}'] key to be a string")

        # Python policy packs should specify a version in PulumiPolicy.yaml; the CLI will use the
        # version specified there. We always return "0.0.1" from here which will only be used if
        # there isn't a version in PulumiPolicy.yaml.
        version = "0.0.1"

        servicer = _PolicyAnalyzerServicer(
            name,
            version,
            policies,
            enforcement_level if enforcement_level is not None else EnforcementLevel.ADVISORY,
            initial_config)
        server = grpc.server(
            futures.ThreadPoolExecutor(max_workers=4),
            options=_GRPC_CHANNEL_OPTIONS
        )
        analyzer_pb2_grpc.add_AnalyzerServicer_to_server(
            servicer, server)
        port = server.add_insecure_port(address="0.0.0.0:0")
        server.start()
        sys.stdout.buffer.write(f"{port}\n".encode())
        try:
            while True:
                time.sleep(_ONE_DAY_IN_SECONDS)
        except KeyboardInterrupt:
            server.stop(0)


class EnforcementLevel(Enum):
    """
    Indicates the impact of a policy violation.
    """

    ADVISORY = "advisory"
    MANDATORY = "mandatory"
    DISABLED = "disabled"


class PolicyConfigSchema:
    """
    Represents the configuration schema for a policy.
    """

    properties: Dict[str, Dict[str, Any]]
    """
    The policy's configuration properties.
    """

    required: Optional[List[str]]
    """
    The configuration properties that are required.
    """

    def __init__(self,
                 properties: Dict[str, Dict[str, Any]],
                 required: Optional[List[str]] = None) -> None:
        """
        :param Dict[str, Dict[str, Any]] properties: The policy's configuration properties.
        :param Optional[List[str]] required: The configuration properties that are required.
        """
        if not isinstance(properties, dict):
            raise TypeError("Expected properties to be a dict")
        for k, v in properties.items():
            if not isinstance(k, str):
                raise TypeError("Expected properties key to be a string")
            if not isinstance(v, dict):
                raise TypeError(f"Expected properties['{k}'] to be a dict")
            if "enforcementLevel" in properties:
                raise TypeError("enforcementLevel cannot be explicitly specified in properties")
            for vk in v:
                if not isinstance(vk, str):
                    raise TypeError(f"Expected properties['{k}'] key to be a string")
        if required is not None:
            if not isinstance(required, List):
                raise TypeError("Expected properties to be a list of strings")
            for r in required:
                if not isinstance(r, str):
                    raise TypeError("Expected properties to be a list of strings")
                if r == "enforcementLevel":
                    raise TypeError('"enforcementLevel" cannot be specified in required')
        self.properties = properties
        self.required = required


class Policy(ABC):
    """
    A policy function that returns true if a resource definition violates some policy (e.g., "no
    public S3 buckets"), and a set of metadata useful for generating helpful messages when the policy
    is violated.
    """

    name: str
    """
    An ID for the policy. Must be unique within the current policy set.
    """

    description: str
    """
    A brief description of the policy rule. e.g., "S3 buckets should have default encryption
    enabled."
    """

    enforcement_level: Optional[EnforcementLevel]
    """
    Indicates what to do on policy violation, e.g., block deployment but allow override with
    proper permissions.
    """

    config_schema: Optional[PolicyConfigSchema]
    """
    This policy's configuration schema.
    """

    def __init__(self,
                 name: str,
                 description: str,
                 enforcement_level: Optional[EnforcementLevel] = None,
                 config_schema: Optional[PolicyConfigSchema] = None) -> None:
        """
        :param str name: An ID for the policy. Must be unique within the current policy set.
        :param str description: A brief description of the policy rule. e.g., "S3 buckets should have
               default encryptionenabled."
        :param Optional[EnforcementLevel] enforcement_level: Indicates what to do on policy violation,
               e.g., block deployment but allow override with proper permissions.
        :param Optional[PolicyConfigSchema] config_schema: This policy's configuration schema.
        """
        if not name:
            raise TypeError("Missing name argument")
        if not isinstance(name, str):
            raise TypeError("Expected name to be a string")
        if name == "all":
            raise TypeError(
                'Invalid policy name "all"; "all" is a reserved name')
        if not description:
            raise TypeError("Missing description argument")
        if not isinstance(description, str):
            raise TypeError("Expected description to be a string")
        if enforcement_level is not None and not isinstance(enforcement_level, EnforcementLevel):
            raise TypeError(
                "Expected enforcement_level to be an EnforcementLevel")
        if config_schema is not None and not isinstance(config_schema, PolicyConfigSchema):
            raise TypeError(
                "Expected config_schema to be a PolicyConfigSchema")
        self.name = name
        self.description = description
        self.enforcement_level = enforcement_level
        self.config_schema = config_schema


ReportViolation = Callable[[str, Optional[str]], None]
"""
ReportViolation is the callback signature used to report policy violations.
The first param is the violation message and the second is an optional
urn of the resource to associate with the violations.
"""


class ResourceValidationArgs:
    """
    ResourceValidationArgs is the argument bag passed to a resource validation.
    """

    resource_type: str
    """
    The type of the resource.
    """

    props: Mapping[str, Any]
    """
    The inputs of the resource.
    """

    urn: str
    """
    The URN of the resource.
    """

    name: str
    """
    The name of the resource.
    """

    opts: 'PolicyResourceOptions'
    """
    The options of the resource.
    """

    provider: Optional['PolicyProviderResource']
    """
    The provider of the resource.
    """

    __config: Mapping[str, Any]
    """
    Private field holding the configuration for this policy.
    """

    def get_config(self) -> Mapping[str, Any]:
        """
        Returns configuration for the policy.
        """
        return self.__config

    def __init__(self,
                 resource_type: str,
                 props: Mapping[str, Any],
                 urn: str,
                 name: str,
                 opts: 'PolicyResourceOptions',
                 provider: Optional['PolicyProviderResource'],
                 config: Optional[Mapping[str, Any]] = None) -> None:
        self.resource_type = resource_type
        self.props = props
        self.urn = urn
        self.name = name
        self.opts = opts
        self.provider = provider
        self.__config = config if config is not None else {}


class PolicyResourceOptions:
    """
    PolicyResourceOptions is the bag of settings that control a resource's behavior.
    """

    protect: bool
    """
    When set to true, protect ensures this resource cannot be deleted.
    """

    ignore_changes: List[str]
    """
    Ignore changes to any of the specified properties.
    """

    delete_before_replace: Optional[bool]
    """
    When set to true, indicates that this resource should be deleted before
    its replacement is created when replacement is necessary.
    """

    aliases: List[str]
    """
    Additional URNs that should be aliased to this resource.
    """

    custom_timeouts: 'PolicyCustomTimeouts'
    """
    Custom timeouts for resource create, update, and delete operations.
    """

    additional_secret_outputs: List[str]
    """
    Outputs that should always be treated as secrets.
    """

    def __init__(self,
                 protect: bool,
                 ignore_changes: List[str],
                 delete_before_replace: Optional[bool],
                 aliases: List[str],
                 custom_timeouts: 'PolicyCustomTimeouts',
                 additional_secret_outputs: List[str]) -> None:
        self.protect = protect
        self.ignore_changes = ignore_changes
        self.delete_before_replace = delete_before_replace
        self.aliases = aliases
        self.custom_timeouts = custom_timeouts
        self.additional_secret_outputs = additional_secret_outputs


class PolicyCustomTimeouts:
    """
    Custom timeout options.
    """

    create_seconds: float
    """
    The create resource timeout.
    """

    update_seconds: float
    """
    The update resource timeout.
    """

    delete_seconds: float
    """
    The delete resource timeout.
    """

    def __init__(self,
                 create_seconds: float,
                 update_seconds: float,
                 delete_seconds: float) -> None:
        self.create_seconds = create_seconds
        self.update_seconds = update_seconds
        self.delete_seconds = delete_seconds


class PolicyProviderResource:
    """
    Information about the provider.
    """

    resource_type: str
    """
    The type of the provider resource.
    """

    props: Mapping[str, Any]
    """
    The properties of the provider resource.
    """

    urn: str
    """
    The URN of the provider resource.
    """

    name: str
    """
    The name of the provider resource.
    """

    def __init__(self,
                 resource_type: str,
                 props: Mapping[str, Any],
                 urn: str,
                 name: str) -> None:
        self.resource_type = resource_type
        self.props = props
        self.urn = urn
        self.name = name


ResourceValidation = Callable[[ResourceValidationArgs, ReportViolation], Optional[Awaitable]]
"""
ResourceValidation is the callback signature for a `ResourceValidationPolicy`. A resource validation
is passed `args` with more information about the resource and a `ReportViolation` callback that can be
used to report a policy violation. `ReportViolation` can be called multiple times to report multiple
violations against the same resource. `ReportViolation` must be passed a message about the violation.
The `ReportViolation` signature accepts an optional `urn` argument, which is ignored when validating
resources (the `urn` of the resource being validated is always used).
"""


class ResourceValidationPolicy(Policy):
    """
    ResourceValidationPolicy is a policy that validates a resource definition.
    """

    __validate: Optional[Union[ResourceValidation, List[ResourceValidation]]]
    """
    Private field holding the optional validation callback.
    """

    def validate(self, args: ResourceValidationArgs, report_violation: ReportViolation) -> Optional[Awaitable]:
        if not self.__validate:
            raise NotImplementedError(f'`validate must be overridden by policy "{self.name}"'
                                      + ' since `validate was not specified')

        awaitable_results: List[Awaitable] = []

        validations = (self.__validate if isinstance(self.__validate, list)
                       else [self.__validate])

        for validation in validations:
            result = validation(args, report_violation)
            if result is not None and isawaitable(result):
                awaitable_results.append(cast(Awaitable, result))

        if awaitable_results:
            return asyncio.wait(awaitable_results)

        return None

    def __init__(self,
                 name: str,
                 description: str,
                 validate: Optional[Union[ResourceValidation, List[ResourceValidation]]] = None,
                 enforcement_level: Optional[EnforcementLevel] = None,
                 config_schema: Optional[PolicyConfigSchema] = None) -> None:
        """
        :param str name: An ID for the policy. Must be unique within the current policy set.
        :param str description: A brief description of the policy rule. e.g., "S3 buckets should have
               default encryptionenabled."
        :param Optional[Union[ResourceValidation, List[ResourceValidation]]] validate: A callback function
               that validates if a resource definition violates a policy (e.g. "S3 buckets can't be public").
               A single callback function can be specified, or multiple functions, which are called in order.
        :param Optional[EnforcementLevel] enforcement_level: Indicates what to do on policy violation,
               e.g., block deployment but allow override with proper permissions.
        :param Optional[PolicyConfigSchema] config_schema: This policy's configuration schema.
        """
        super().__init__(name, description, enforcement_level, config_schema)

        # If this instance isn't a subclass, then validate must be specified.
        not_subclassed = type(self) is ResourceValidationPolicy # pylint: disable=unidiomatic-typecheck
        if not_subclassed and not validate:
            raise TypeError("Missing validate argument")

        if validate:
            if not callable(validate) and not isinstance(validate, list):
                raise TypeError("Expected validate to be callable or a list of callables")
            if isinstance(validate, list) and any(not callable(v) for v in validate):
                raise TypeError("Expected validate to be callable or a list of callables")

        self.__validate = validate # type: ignore


class PolicyResource:
    """
    PolicyResource represents a resource in the stack.
    """

    resource_type: str
    """
    The type of the resource.
    """

    props: Mapping[str, Any]
    """
    The outputs of the resource.
    """

    urn: str
    """
    The URN of the resource.
    """

    name: str
    """
    The name of the resource.
    """

    opts: PolicyResourceOptions
    """
    The options of the resource.
    """

    provider: Optional[PolicyProviderResource]
    """
    The provider of the resource.
    """

    parent: Optional['PolicyResource']
    """
    An optional parent that this resource belongs to.
    """

    dependencies: List['PolicyResource']
    """
    The dependencies of the resource.
    """

    property_dependencies: Dict[str, List['PolicyResource']]
    """
    The set of dependencies that affect each property.
    """

    def __init__(self,
                 resource_type: str,
                 props: Mapping[str, Any],
                 urn: str,
                 name: str,
                 opts: PolicyResourceOptions,
                 provider: Optional[PolicyProviderResource],
                 parent: Optional['PolicyResource'],
                 dependencies: List['PolicyResource'],
                 property_dependencies: Dict[str, List['PolicyResource']]) -> None:
        self.resource_type = resource_type
        self.props = props
        self.urn = urn
        self.name = name
        self.opts = opts
        self.provider = provider
        self.parent = parent
        self.dependencies = dependencies
        self.property_dependencies = property_dependencies


class StackValidationArgs:
    """
    StackValidationArgs is the argument bag passed to a stack validation.
    """

    resources: List[PolicyResource]
    """
    The resources in the stack.
    """

    __config: Mapping[str, Any]
    """
    Private field holding the configuration for this policy.
    """

    def get_config(self) -> Mapping[str, Any]:
        """
        Returns configuration for the policy.
        """
        return self.__config

    def __init__(self,
                 resources: List[PolicyResource],
                 config: Optional[Mapping[str, Any]] = None) -> None:
        self.resources = resources
        self.__config = config if config is not None else {}


StackValidation = Callable[[StackValidationArgs, ReportViolation], Optional[Awaitable]]
"""
StackValidation is the callback signature for a `StackValidationPolicy`. A stack validation is passed
`args` with more information about the stack and a `report_violation` callback that can be used to
report a policy violation. `report_violation` can be called multiple times to report multiple violations
against the stack. `report_violation` must be passed a message about the violation, and an optional `urn`
to a resource in the stack that's in violation of the policy. Not specifying a `urn` indicates the
overall stack is in violation of the policy.
"""


class StackValidationPolicy(Policy):
    """
    StackValidationPolicy is a policy that validates a stack.
    """

    __validate: Optional[StackValidation]
    """
    Private field holding the optional validation callback.
    """

    def validate(self, args: StackValidationArgs, report_violation: ReportViolation) -> Optional[Awaitable]:
        if not self.__validate:
            raise NotImplementedError(f'`validate` must be overridden by policy "{self.name}"'
                                      + ' since `validate` was not specified')

        result = self.__validate(args, report_violation)
        if result is not None and isawaitable(result):
            return cast(Awaitable, result)

        return None

    def __init__(self,
                 name: str,
                 description: str,
                 validate: Optional[StackValidation] = None,
                 enforcement_level: Optional[EnforcementLevel] = None,
                 config_schema: Optional[PolicyConfigSchema] = None) -> None:
        """
        :param str name: An ID for the policy. Must be unique within the current policy set.
        :param str description: A brief description of the policy rule. e.g., "S3 buckets should have
               default encryptionenabled."
        :param Optional[StackValidation] validate: A callback function that validates if a stack violates a policy.
        :param Optional[EnforcementLevel] enforcement_level: Indicates what to do on policy violation,
               e.g., block deployment but allow override with proper permissions.
        :param Optional[PolicyConfigSchema] config_schema: This policy's configuration schema.
        """
        super().__init__(name, description, enforcement_level, config_schema)

        # If this instance isn't a subclass, then validate must be specified.
        not_subclassed = type(self) is StackValidationPolicy # pylint: disable=unidiomatic-typecheck
        if not_subclassed and not validate:
            raise TypeError("Missing validate argument")

        if validate:
            if not callable(validate):
                raise TypeError("Expected validate to be callable")

        self.__validate = validate # type: ignore


class _PolicyAnalyzerServicer(proto.AnalyzerServicer):
    __policy_pack_name: str
    __policy_pack_version: str
    __policies: List[Policy]
    __policy_pack_enforcement_level: EnforcementLevel
    __initial_config: Optional[Dict[str, Union[EnforcementLevel, Dict[str, Any]]]]
    __policy_pack_config: Dict[str, Dict[str, Any]]
    __policy_pack_config_enforcement_level: Dict[str, EnforcementLevel]

    class IntermediateStackResource(NamedTuple):
        resource: PolicyResource
        parent: Optional[str]
        dependencies: List[str]
        property_dependencies: Dict[str, List[str]]

    def Analyze(self, request, context):
        diagnostics: List[proto.AnalyzeDiagnostic] = []
        for policy in self.__policies:
            enforcement_level = self._get_enforcement_level(policy)
            if enforcement_level == EnforcementLevel.DISABLED or not isinstance(policy, ResourceValidationPolicy):
                continue

            report_violation = self._create_report_violation(diagnostics, policy.name,
                                                             policy.description, enforcement_level)

            deserialized = deserialize_properties(json_format.MessageToDict(request.properties))
            props = unknown_checking_proxy(deserialized)
            opts = self._get_resource_options(request)
            provider = self._get_provider_resource(request)
            config = self._get_policy_config(policy.name)
            args = ResourceValidationArgs(request.type, props, request.urn, request.name, opts, provider, config)

            try:
                result = policy.validate(args, report_violation)
                if isawaitable(result):
                    loop = asyncio.new_event_loop()
                    loop.run_until_complete(result)
                    loop.close()
            except UnknownValueError as e:
                diagnostics.append(proto.AnalyzeDiagnostic(
                    policyName=policy.name,
                    policyPackName=self.__policy_pack_name,
                    policyPackVersion=self.__policy_pack_version,
                    message=f"can't run policy '{policy.name}' during preview: {e.message}",
                    urn="",
                    description=policy.description,
                    enforcementLevel=self._map_enforcement_level(EnforcementLevel.ADVISORY),
                ))

        return proto.AnalyzeResponse(diagnostics=diagnostics)

    def AnalyzeStack(self, request, context):
        diagnostics: List[proto.AnalyzeDiagnostic] = []
        for policy in self.__policies:
            enforcement_level = self._get_enforcement_level(policy)
            if enforcement_level == EnforcementLevel.DISABLED or not isinstance(policy, StackValidationPolicy):
                continue

            report_violation = self._create_report_violation(diagnostics, policy.name,
                                                             policy.description, enforcement_level)

            intermediates: List[_PolicyAnalyzerServicer.IntermediateStackResource] = []
            for r in request.resources:
                deserialized = deserialize_properties(json_format.MessageToDict(r.properties))
                props = unknown_checking_proxy(deserialized)
                opts = self._get_resource_options(r)
                provider = self._get_provider_resource(r)
                resource = PolicyResource(r.type, props, r.urn, r.name, opts, provider, None, [], {})
                property_dependencies: Dict[str, List[str]] = {}
                for k, v in r.propertyDependencies.items():
                    property_dependencies[k] = list(v.urns)
                intermediates.append(_PolicyAnalyzerServicer.IntermediateStackResource(resource, r.parent, list(r.dependencies), property_dependencies))

            # Create a map of URNs to resources, used to fill in the parent and dependencies
            # with references to the actual resource objects.
            urns_to_resources: Dict[str, PolicyResource] = {}
            for i in intermediates:
                urns_to_resources[i.resource.urn] = i.resource

            # Go through each intermediate result and set the parent and dependencies.
            for i in intermediates:
                # If the resource has a parent, lookup and set it to the actual resource object.
                if i.parent is not None and i.parent in urns_to_resources:
                    i.resource.parent = urns_to_resources[i.parent]

                # Set dependencies to actual resource objects.
                for d in i.dependencies:
                    if d in urns_to_resources:
                        i.resource.dependencies.append(urns_to_resources[d])

                # Set property_dependencies to actual resource objects.
                for k in i.property_dependencies:
                    v = i.property_dependencies[k]
                    deps: List[PolicyResource] = []
                    for d in v:
                        if d in urns_to_resources:
                            deps.append(urns_to_resources[d])
                    i.resource.property_dependencies[k] = deps

            resources: List[PolicyResource] = []
            for i in intermediates:
                resources.append(i.resource)
            config = self._get_policy_config(policy.name)
            args = StackValidationArgs(resources, config)

            try:
                result = policy.validate(args, report_violation)
                if isawaitable(result):
                    loop = asyncio.new_event_loop()
                    loop.run_until_complete(result)
                    loop.close()
            except UnknownValueError as e:
                diagnostics.append(proto.AnalyzeDiagnostic(
                    policyName=policy.name,
                    policyPackName=self.__policy_pack_name,
                    policyPackVersion=self.__policy_pack_version,
                    message=f"can't run policy '{policy.name}' during preview: {e.message}",
                    urn="",
                    description=policy.description,
                    enforcementLevel=self._map_enforcement_level(EnforcementLevel.ADVISORY),
                ))

        return proto.AnalyzeResponse(diagnostics=diagnostics)

    def GetAnalyzerInfo(self, request, context):
        policies: List[proto.PolicyInfo] = []
        for policy in self.__policies:
            enforcement_level = (policy.enforcement_level if policy.enforcement_level is not None
                                 else self.__policy_pack_enforcement_level)

            schema = {}
            if policy.config_schema is not None:
                if policy.config_schema.properties:
                    properties = struct_pb2.Struct()
                    for k, v in policy.config_schema.properties.items():
                        # pylint: disable=unsupported-assignment-operation
                        properties[k] = v
                    schema["properties"] = properties
                if policy.config_schema.required:
                    schema["required"] = policy.config_schema.required

            policies.append(proto.PolicyInfo(
                name=policy.name,
                description=policy.description,
                enforcementLevel=self._map_enforcement_level(enforcement_level),
                configSchema=proto.PolicyConfigSchema(**schema) if schema else None,
            ))

        initial_config = {}
        if self.__initial_config is not None:
            normalized_config = _normalize_config(self.__initial_config)
            for key, val in normalized_config.items():
                config = {}
                if val.enforcement_level is not None:
                    config["enforcementLevel"] = self._map_enforcement_level(val.enforcement_level)
                if val.properties:
                    properties = struct_pb2.Struct()
                    for k, v in val.properties.items():
                        # pylint: disable=unsupported-assignment-operation
                        properties[k] = v
                    config["properties"] = properties
                if config:
                    initial_config[key] = proto.PolicyConfig(**config)

        return proto.AnalyzerInfo(
            name=self.__policy_pack_name,
            version=self.__policy_pack_version,
            supportsConfig=True,
            policies=policies,
            initialConfig=initial_config,
        )

    def GetPluginInfo(self, request, context):
        return proto.PluginInfo(version=SEMVERSION)

    def Configure(self, request, context):
        config, config_enforcement_level = {}, {}
        for k in request.policyConfig:
            v = request.policyConfig[k]
            config[k] = json_format.MessageToDict(v.properties)
            config_enforcement_level[k] = self._convert_enforcement_level(v.enforcementLevel)
        self.__policy_pack_config = config
        self.__policy_pack_config_enforcement_level = config_enforcement_level
        return empty_pb2.Empty()

    def __init__(self,
                 name: str,
                 version: str,
                 policies: List[Policy],
                 enforcement_level: EnforcementLevel,
                 initial_config: Optional[Dict[str, Union['EnforcementLevel', Dict[str, Any]]]] = None) -> None:
        assert name and isinstance(name, str)
        assert version and isinstance(version, str)
        assert policies and isinstance(policies, list)
        assert enforcement_level and isinstance(
            enforcement_level, EnforcementLevel)
        assert initial_config is None or isinstance(initial_config, dict)
        self.__policy_pack_name = name
        self.__policy_pack_version = version
        self.__policies = policies
        self.__policy_pack_enforcement_level = enforcement_level
        self.__initial_config = initial_config
        self.__policy_pack_config = {}
        self.__policy_pack_config_enforcement_level = {}

    def _get_enforcement_level(self, policy: Policy) -> EnforcementLevel:
        if policy.name in self.__policy_pack_config_enforcement_level:
            return self.__policy_pack_config_enforcement_level[policy.name]

        return (policy.enforcement_level if policy.enforcement_level is not None
                else self.__policy_pack_enforcement_level)

    def _create_report_violation(self,
                                 diagnostics: List[Any],
                                 policy_name: str,
                                 policy_description: str,
                                 enforcement_level: EnforcementLevel) -> ReportViolation:
        def report_violation(message: str, urn: Optional[str] = None) -> None:
            if message and not isinstance(message, str):
                raise TypeError("Expected message to be a string")
            if urn is not None and not isinstance(urn, str):
                raise TypeError("Expected urn to be a string")

            violation_message = policy_description
            if message:
                violation_message += f"\n{message}"

            diagnostics.append(proto.AnalyzeDiagnostic(
                policyName=policy_name,
                policyPackName=self.__policy_pack_name,
                policyPackVersion=self.__policy_pack_version,
                message=violation_message,
                urn=urn if urn else "",
                description=policy_description,
                enforcementLevel=self._map_enforcement_level(enforcement_level),
            ))
        return report_violation

    def _map_enforcement_level(self, enforcement_level: EnforcementLevel) -> int:
        if enforcement_level == EnforcementLevel.ADVISORY:
            return proto.ADVISORY
        if enforcement_level == EnforcementLevel.MANDATORY:
            return proto.MANDATORY
        if enforcement_level == EnforcementLevel.DISABLED:
            return proto.DISABLED
        raise AssertionError(
            f"unknown enforcement level: {enforcement_level}")

    def _convert_enforcement_level(self, enforcement_level: int) -> EnforcementLevel:
        if enforcement_level == proto.ADVISORY:
            return EnforcementLevel.ADVISORY
        if enforcement_level == proto.MANDATORY:
            return EnforcementLevel.MANDATORY
        if enforcement_level == proto.DISABLED:
            return EnforcementLevel.DISABLED
        raise AssertionError(
            f"unknown enforcement level: {enforcement_level}")

    def _get_resource_options(self, request) -> PolicyResourceOptions:
        opts = request.options
        protect = opts.protect
        ignore_changes = opts.ignoreChanges
        delete_before_replace = None if not opts.deleteBeforeReplaceDefined else opts.deleteBeforeReplace
        aliases = opts.aliases
        custom_timeouts = (PolicyCustomTimeouts(opts.customTimeouts.create, opts.customTimeouts.update,
                                                opts.customTimeouts.delete) if opts.HasField("customTimeouts")
                           else PolicyCustomTimeouts(0, 0, 0))
        additional_secret_outputs = opts.additionalSecretOutputs
        return PolicyResourceOptions(
            protect, ignore_changes, delete_before_replace, aliases, custom_timeouts, additional_secret_outputs)

    def _get_provider_resource(self, request) -> Optional[PolicyProviderResource]:
        if not request.HasField("provider"):
            return None
        prov = request.provider
        deserialized = deserialize_properties(json_format.MessageToDict(prov.properties))
        props = unknown_checking_proxy(deserialized)
        return PolicyProviderResource(prov.type, props, prov.urn, prov.name)

    def _get_policy_config(self, name: str) -> Optional[Dict[str, Any]]:
        if name in self.__policy_pack_config:
            config = self.__policy_pack_config[name]
            if config:
                return config.copy()
        return None


class _NormalizedConfigValue(NamedTuple):
    enforcement_level: Optional[EnforcementLevel]
    properties: Optional[Dict[str, Any]]


def _normalize_config(config: Dict[str, Union[EnforcementLevel, Dict[str, Any]]]) -> Dict[str, _NormalizedConfigValue]:
    result = {}

    for key in config:
        val = config[key]

        # If the value is an enforcement level, we're done.
        if isinstance(val, EnforcementLevel):
            result[key] = _NormalizedConfigValue(val, None)
            continue

        # Otherwise, it's an object that may have an enforcement level and additional
        # properties.
        enforcement_level, properties = None, None
        for k in val:
            if k == "enforcementLevel":
                enforcement_level = val["enforcementLevel"]
            else:
                if properties is None:
                    properties = {}
                properties[k] = val[k]
        result[key] = _NormalizedConfigValue(enforcement_level, properties)

    return result
