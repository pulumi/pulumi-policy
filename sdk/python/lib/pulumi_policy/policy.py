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
from typing import Any, Awaitable, Callable, Dict, List, NamedTuple, Optional, Union, cast
from abc import ABC

import grpc
from google.protobuf import empty_pb2, json_format
from pulumi.runtime import proto
from pulumi.runtime.proto import analyzer_pb2_grpc

from .version import SEMVERSION

_ONE_DAY_IN_SECONDS = 60 * 60 * 24

_POLICY_PACK_NAME_RE = re.compile("^[a-zA-Z0-9-_.]{1,100}$")

class PolicyPack:
    """
    A policy pack contains one or more policies to enforce.
    """

    def __init__(self,
                 name: str,
                 policies: List['Policy'],
                 enforcement_level: Optional['EnforcementLevel'] = None) -> None:
        """
        :param str name: The name of the policy pack.
        :param List[Policy] policies: The policies associated with a policy pack.
        :param Optional[EnforcementLevel] enforcement_level: Indicates what to do on policy
               violation, e.g., block deployment but allow override with
               proper permissions. This is the default used for all policies in the policy pack.
               Individual policies can override.
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

        # TODO[pulumi/pulumi-policy#208]: lookup the policy pack actual version.
        version = "0.0.1"

        servicer = _PolicyAnalyzerServicer(
            name, version, policies, enforcement_level if enforcement_level is not None else EnforcementLevel.ADVISORY)
        server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
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

    def __init__(self,
                 name: str,
                 description: str,
                 enforcement_level: Optional[EnforcementLevel] = None) -> None:
        """
        :param str name: An ID for the policy. Must be unique within the current policy set.
        :param str description: A brief description of the policy rule. e.g., "S3 buckets should have
               default encryptionenabled."
        :param Optional[EnforcementLevel] enforcement_level: Indicates what to do on policy violation,
               e.g., block deployment but allow override with proper permissions.
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
        self.name = name
        self.description = description
        self.enforcement_level = enforcement_level


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

    props: Dict[str, Any]
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

    def __init__(self,
                 resource_type: str,
                 props: Dict[str, Any],
                 urn: str,
                 name: str,
                 opts: 'PolicyResourceOptions',
                 provider: Optional['PolicyProviderResource']) -> None:
        self.resource_type = resource_type
        self.props = props
        self.urn = urn
        self.name = name
        self.opts = opts
        self.provider = provider


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

    props: Dict[str, Any]
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
                 props: Dict[str, Any],
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
                 enforcement_level: Optional[EnforcementLevel] = None) -> None:
        """
        :param str name: An ID for the policy. Must be unique within the current policy set.
        :param str description: A brief description of the policy rule. e.g., "S3 buckets should have
               default encryptionenabled."
        :param Optional[Union[ResourceValidation, List[ResourceValidation]]] validate: A callback function
               that validates if a resource definition violates a policy (e.g. "S3 buckets can't be public").
               A single callback function can be specified, or multiple functions, which are called in order.
        :param Optional[EnforcementLevel] enforcement_level: Indicates what to do on policy violation,
               e.g., block deployment but allow override with proper permissions.
        """
        super().__init__(name, description, enforcement_level)

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

    props: Dict[str, Any]
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
                 props: Dict[str, Any],
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

    def __init__(self, resources: List[PolicyResource]) -> None:
        self.resources = resources


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
                 enforcement_level: Optional[EnforcementLevel] = None) -> None:
        """
        :param str name: An ID for the policy. Must be unique within the current policy set.
        :param str description: A brief description of the policy rule. e.g., "S3 buckets should have
               default encryptionenabled."
        :param Optional[StackValidation] validate: A callback function that validates if a stack violates a policy.
        :param Optional[EnforcementLevel] enforcement_level: Indicates what to do on policy violation,
               e.g., block deployment but allow override with proper permissions.
        """
        super().__init__(name, description, enforcement_level)

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

    def Analyze(self, request, context):
        diagnostics: List[proto.AnalyzeDiagnostic] = []
        for policy in self.__policies:
            enforcement_level = self._get_enforcement_level(policy)
            if enforcement_level == EnforcementLevel.DISABLED or not isinstance(policy, ResourceValidationPolicy):
                continue

            report_violation = self._create_report_violation(diagnostics, policy.name,
                                                             policy.description, enforcement_level)

            # TODO[pulumi/pulumi-policy#208]: Deserialize properties
            # TODO[pulumi/pulumi-policy#208]: Unknown checking proxy
            props = json_format.MessageToDict(request.properties)
            opts = self._get_resource_options(request)
            provider = self._get_provider_resource(request)
            args = ResourceValidationArgs(request.type, props, request.urn, request.name, opts, provider)

            result = policy.validate(args, report_violation)
            if isawaitable(result):
                loop = asyncio.new_event_loop()
                loop.run_until_complete(result)
                loop.close()

        return proto.AnalyzeResponse(diagnostics=diagnostics)

    def AnalyzeStack(self, request, context):
        diagnostics: List[proto.AnalyzeDiagnostic] = []
        for policy in self.__policies:
            enforcement_level = self._get_enforcement_level(policy)
            if enforcement_level == EnforcementLevel.DISABLED or not isinstance(policy, StackValidationPolicy):
                continue

            report_violation = self._create_report_violation(diagnostics, policy.name,
                                                             policy.description, enforcement_level)

            class IntermediateStackResource(NamedTuple):
                resource: PolicyResource
                parent: Optional[str]
                dependencies: List[str]
                property_dependencies: Dict[str, List[str]]

            intermediates: List[IntermediateStackResource] = []
            for r in request.resources:
                # TODO[pulumi/pulumi-policy#208]: Deserialize properties
                # TODO[pulumi/pulumi-policy#208]: Unknown checking proxy
                props = json_format.MessageToDict(r.properties)
                opts = self._get_resource_options(r)
                provider = self._get_provider_resource(r)
                resource = PolicyResource(r.type, props, r.urn, r.name, opts, provider, None, [], {})
                property_dependencies: Dict[str, List[str]] = {}
                for k, v in r.propertyDependencies.items():
                    property_dependencies[k] = list(v.urns)
                intermediates.append(IntermediateStackResource(resource, r.parent, list(r.dependencies), property_dependencies))

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
            args = StackValidationArgs(resources)

            result = policy.validate(args, report_violation)
            if isawaitable(result):
                loop = asyncio.new_event_loop()
                loop.run_until_complete(result)
                loop.close()

        return proto.AnalyzeResponse(diagnostics=diagnostics)

    def GetAnalyzerInfo(self, request, context):
        policies: List[proto.PolicyInfo] = []
        for policy in self.__policies:
            enforcement_level = (policy.enforcement_level if policy.enforcement_level is not None
                                 else self.__policy_pack_enforcement_level)
            policies.append(proto.PolicyInfo(
                name=policy.name,
                description=policy.description,
                enforcementLevel=self._map_enforcement_level(enforcement_level),
                # TODO[pulumi/pulumi-policy#210]: Expose config schema
            ))

        return proto.AnalyzerInfo(
            name=self.__policy_pack_name,
            version=self.__policy_pack_version,
            supportsConfig=False,  # TODO[pulumi/pulumi-policy#210]: Set to True when config support is added
            policies=policies,
        )

    def GetPluginInfo(self, request, context):
        return proto.PluginInfo(version=SEMVERSION)

    def Configure(self, request, context):
        # TODO[pulumi/pulumi-policy#210]: Add support for config
        return empty_pb2.Empty()

    def __init__(self,
                 name: str,
                 version: str,
                 policies: List[Policy],
                 enforcement_level: EnforcementLevel) -> None:
        assert name and isinstance(name, str)
        assert version and isinstance(version, str)
        assert policies and isinstance(policies, list)
        assert enforcement_level and isinstance(
            enforcement_level, EnforcementLevel)
        self.__policy_pack_name = name
        self.__policy_pack_version = version
        self.__policies = policies
        self.__policy_pack_enforcement_level = enforcement_level

    def _get_enforcement_level(self, policy: Policy) -> EnforcementLevel:
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
        # TODO[pulumi/pulumi-policy#208]: deserialize properties
        # TODO[pulumi/pulumi-policy#208]: unknown checking proxy
        props = json_format.MessageToDict(prov.properties)
        return PolicyProviderResource(prov.type, props, prov.urn, prov.name)
