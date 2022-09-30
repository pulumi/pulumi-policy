package policy

import (
	"context"
	"errors"
	"fmt"
	"github.com/pulumi/pulumi-policy/sdk/go/version"
	"github.com/pulumi/pulumi/sdk/v3/go/common/resource"
	"github.com/pulumi/pulumi/sdk/v3/go/common/util/contract"
	"os"
	"regexp"

	pbempty "github.com/golang/protobuf/ptypes/empty"
	"github.com/pulumi/pulumi/sdk/v3/go/common/resource/plugin"
	logger "github.com/pulumi/pulumi/sdk/v3/go/common/util/logging"
	"github.com/pulumi/pulumi/sdk/v3/go/common/util/rpcutil"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
	pulumirpc "github.com/pulumi/pulumi/sdk/v3/proto/go"
	"google.golang.org/grpc"
)

type EnforcementLevel int32

const (
	EnforcementLevel_Advisory  EnforcementLevel = 0 // Displayed to users, but does not block deployment.
	EnforcementLevel_Mandatory EnforcementLevel = 1 // Stops deployment, cannot be overridden.
	EnforcementLevel_Disabled  EnforcementLevel = 2 // Disabled policies do not run during a deployment.
)

type PolicyConfigJSONSchemaTypes []PolicyConfigJSONSchemaType

type PolicyConfigJSONSchemaType string

const (
	PolicyConfigJSONSchemaTypeBoolean PolicyConfigJSONSchemaType = "boolean"
	PolicyConfigJSONSchemaTypeNumber  PolicyConfigJSONSchemaType = "number"
	PolicyConfigJSONSchemaTypeNull    PolicyConfigJSONSchemaType = "null"
	PolicyConfigJSONSchemaTypeObject  PolicyConfigJSONSchemaType = "object"
	PolicyConfigJSONSchemaTypeString  PolicyConfigJSONSchemaType = "string"
)

type PolicyConfigJSONSchemaTypeName string

const (
	PolicyConfigJSONSchemaTypeNameString  PolicyConfigJSONSchemaTypeName = "string"
	PolicyConfigJSONSchemaTypeNameNumber  PolicyConfigJSONSchemaTypeName = "number"
	PolicyConfigJSONSchemaTypeNameInteger PolicyConfigJSONSchemaTypeName = "integer"
	PolicyConfigJSONSchemaTypeNameBoolean PolicyConfigJSONSchemaTypeName = "boolean"
	PolicyConfigJSONSchemaTypeNameObject  PolicyConfigJSONSchemaTypeName = "object"
	PolicyConfigJSONSchemaTypeNameArray   PolicyConfigJSONSchemaTypeName = "array"
	PolicyConfigJSONSchemaTypeNameNull    PolicyConfigJSONSchemaTypeName = "null"
)

type PolicyConfigJSONSchema struct {
	Types []PolicyConfigJSONSchemaTypeName `json:"types"`
	Enum  []PolicyConfigJSONSchemaType     `json:"enum"`
	Const []PolicyConfigJSONSchemaType     `json:"const"`

	MultipleOf       *int `json:"multipleOf,omitempty"`
	Maximum          *int `json:"maximum,omitempty"`
	ExclusiveMaximum *int `json:"exclusiveMaximum,omitempty"`
	Minimum          *int `json:"minimum,omitempty"`
	ExclusiveMinimum *int `json:"exclusiveMinimum,omitempty"`

	MaxLength *int    `json:"maxLength,omitempty"`
	MinLength *int    `json:"minLength,omitempty"`
	Pattern   *string `json:"pattern,omitempty"`

	Items                []*PolicyConfigJSONSchema          `json:"items,omitempty"`
	AdditionalItems      *PolicyConfigJSONSchema            `json:"additionalItems,omitempty"`
	MaxItems             *int                               `json:"maxItems,omitempty"`
	MinItems             *int                               `json:"minItems,omitempty"`
	UniqueItems          *bool                              `json:"uniqueItems,omitempty"`
	Contains             *PolicyConfigJSONSchema            `json:"contains,omitempty"`
	MaxProperties        *int                               `json:"maxProperties,omitempty"`
	MinProperties        *int                               `json:"minProperties,omitempty"`
	Required             []string                           `json:"required,omitempty"`
	Properties           map[string]*PolicyConfigJSONSchema `json:"properties,omitempty"`
	PatternProperties    map[string]*PolicyConfigJSONSchema `json:"patternProperties,omitempty"`
	AdditionalProperties *PolicyConfigJSONSchema            `json:"additionalProperties,omitempty"`
	Dependencies         map[string]*PolicyConfigJSONSchema `json:"dependencies,omitempty"`
	PropertyNames        *PolicyConfigJSONSchema            `json:"propertyNames,omitempty"`
	Format               *string                            `json:"format,omitempty"`

	Description *string                     `json:"description,omitempty"`
	Default     *PolicyConfigJSONSchemaType `json:"default,omitempty"`
}

// PolicyConfigSchema represents the configuration schema for a policy.
type PolicyConfigSchema struct {
	/**
	 * The policy's configuration properties.
	 */
	Properties map[string]PolicyConfigJSONSchema `json:"properties"`

	/**
	 * The configuration properties that are required.
	 */
	Required []string `json:"required"`
}

type Policy[T ValidationPolicy] struct {
	Name             string
	Description      string
	EnforcementLevel EnforcementLevel
	ConfigSchema     *PolicyConfigSchema
	ValidationPolicy func() T
}

type ResourceValidationArgs struct {
	Resource *pulumirpc.AnalyzerResource
}

type StackValidationArgs struct {
	Resources []*pulumirpc.AnalyzerResource
}

type ReportViolation func(message string, urn string)

type StackValidationPolicy func(args StackValidationArgs, reportViolation ReportViolation)

type ResourceValidationPolicy func(args ResourceValidationArgs, reportViolation ReportViolation)

type ValidationPolicy interface {
	StackValidationPolicy | ResourceValidationPolicy
}
type Policies[T ValidationPolicy] []Policy[T]

func Run(main func(config *config.Config) error) error {
	// Make up the config for this policy project
	project := os.Getenv("PULUMI_PROJECT")
	config := config.New(nil, project)
	return main(config)
}

var policyPackNameRE = regexp.MustCompile(`^[a-zA-Z0-9-_.]{1,100}$`)

func Pack[T ValidationPolicy](name string, policies Policies[T]) error {
	if name == "" || !policyPackNameRE.MatchString(name) {
		logger.V(1).Infof("Invalid policy pack name %q. Policy pack names may only contain alphanumerics, hyphens, "+
			"underscores, or periods.", name)
		return fmt.Errorf("invalid policy pack name: %q", name)
	}

	for _, policy := range policies {
		if policy.Name == "all" {
			return fmt.Errorf("invalid policy name %[1]q. %[1]q is a reserved name", policy.Name)
		}

		if policy.ConfigSchema != nil {
			if _, ok := policy.ConfigSchema.Properties["enforcementLevel"]; ok {
				return errors.New("enforcementLevel cannot be explicitly specified in configSchema properties")
			}
			for _, req := range policy.ConfigSchema.Required {
				if req == "enforcementLevel" {
					return errors.New("enforcementLevel cannot be required in configSchema")
				}
			}
		}
	}

	// Fire up a gRPC server, letting the kernel choose a free port for us.
	port, done, err := rpcutil.Serve(0, nil, []func(*grpc.Server) error{
		func(srv *grpc.Server) error {
			analyzer := &analyzerServer[T]{
				policyPackName: name,
				policies:       policies,
			}
			pulumirpc.RegisterAnalyzerServer(srv, analyzer)
			return nil
		},
	}, nil)
	if err != nil {
		return fmt.Errorf("fatal: %v", err)
	}

	// The analyzer protocol requires that we now write out the port we have chosen to listen on.
	fmt.Printf("%d\n", port)

	// Finally, wait for the server to stop serving.
	if err := <-done; err != nil {
		return fmt.Errorf("fatal: %v", err)
	}

	return nil
}

type analyzerServer[T ValidationPolicy] struct {
	analyzer         plugin.Analyzer
	policyPackName   string
	policies         Policies[T]
	policyPackConfig map[string]interface{}
}

func (a *analyzerServer[T]) Analyze(ctx context.Context, req *pulumirpc.AnalyzeRequest) (*pulumirpc.AnalyzeResponse, error) {
	switch v := any(a).(type) {
	case *analyzerServer[ResourceValidationPolicy]:
		var ds []*pulumirpc.AnalyzeDiagnostic
		for _, p := range a.policies {
			defaultReportViolation := func(message string, urn string) {
				violationMessage := p.Description
				if message != "" {
					violationMessage += fmt.Sprintf("\n%s", message)
				}

				ds = append(ds, &pulumirpc.AnalyzeDiagnostic{
					PolicyName:       p.Name,
					PolicyPackName:   a.policyPackName,
					Description:      p.Description,
					Message:          violationMessage,
					EnforcementLevel: pulumirpc.EnforcementLevel(p.EnforcementLevel),
					Urn:              urn,
				})
			}
			args := ResourceValidationArgs{
				Resource: &pulumirpc.AnalyzerResource{
					Type:                 req.GetType(),
					Properties:           req.GetProperties(),
					Urn:                  req.GetUrn(),
					Name:                 req.GetName(),
					Options:              req.GetOptions(),
					Provider:             req.GetProvider(),
					Parent:               "",  /* TODO */
					Dependencies:         nil, /* TODO */
					PropertyDependencies: nil, /* TODO */
				},
			}
			switch f := any(p.ValidationPolicy).(type) {
			case func() ResourceValidationPolicy:
				_, _ = fmt.Fprintf(os.Stderr, "Calling resource validation policy: %q on URN: %q\n", p.Name, req.GetUrn())
				f()(args, defaultReportViolation)
			default:
				contract.Fail()
			}
		}
		return &pulumirpc.AnalyzeResponse{
			Diagnostics: ds,
		}, nil
	default:
		return nil, fmt.Errorf("analyze unexpected on stack validation policypack: %q type: %T", a.policyPackName, v)
	}
}

func (a *analyzerServer[T]) AnalyzeStack(ctx context.Context, req *pulumirpc.AnalyzeStackRequest) (*pulumirpc.
	AnalyzeResponse,
	error) {
	switch any(a).(type) {
	case *analyzerServer[StackValidationPolicy]:
		var ds []*pulumirpc.AnalyzeDiagnostic
		for _, p := range a.policies {
			defaultReportViolation := func(message string, urn string) {
				violationMessage := p.Description
				if message != "" {
					violationMessage += fmt.Sprintf("\n%s", message)
				}

				ds = append(ds, &pulumirpc.AnalyzeDiagnostic{
					PolicyName:       p.Name,
					PolicyPackName:   a.policyPackName,
					Description:      p.Description,
					Message:          violationMessage,
					EnforcementLevel: pulumirpc.EnforcementLevel(p.EnforcementLevel),
					Urn:              urn,
				})
			}

			var resources []*pulumirpc.AnalyzerResource
			for _, r := range req.GetResources() {
				resources = append(resources, &pulumirpc.AnalyzerResource{
					Type:                 r.GetType(),
					Properties:           r.GetProperties(),
					Urn:                  r.GetUrn(),
					Name:                 r.GetName(),
					Options:              r.GetOptions(),
					Provider:             r.GetProvider(),
					Parent:               r.GetParent(),
					Dependencies:         r.GetDependencies(),
					PropertyDependencies: r.GetPropertyDependencies(),
				})
			}
			args := StackValidationArgs{
				Resources: resources,
			}
			switch f := any(p.ValidationPolicy).(type) {
			case func() StackValidationPolicy:
				f()(args, defaultReportViolation)
			default:
				contract.Fail()
			}
		}
		return &pulumirpc.AnalyzeResponse{
			Diagnostics: ds,
		}, nil
	default:
		// Ignore since we seem to call analyze stack regardless.
		return &pulumirpc.AnalyzeResponse{}, nil
	}

}

func (a *analyzerServer[T]) GetAnalyzerInfo(context.Context, *pbempty.Empty) (*pulumirpc.AnalyzerInfo, error) {
	var policies []*pulumirpc.PolicyInfo

	for _, p := range a.policies {
		var required []string
		configSchemaProps := resource.NewPropertyMapFromMap(nil)
		if p.ConfigSchema != nil {
			configSchemaProps = resource.NewPropertyMap(p.ConfigSchema.Properties)
			required = p.ConfigSchema.Required
		}
		props, err := plugin.MarshalProperties(configSchemaProps,
			plugin.MarshalOptions{KeepSecrets: true})
		if err != nil {
			return nil, fmt.Errorf("failed to marshal properties for policy pack: %q: %w", a.policyPackName, err)
		}
		configSchema := pulumirpc.PolicyConfigSchema{
			Properties: props,
			Required:   required,
		}

		policies = append(policies, &pulumirpc.PolicyInfo{
			Name:             p.Name,
			Description:      p.Description,
			EnforcementLevel: pulumirpc.EnforcementLevel(p.EnforcementLevel),
			ConfigSchema:     &configSchema,
		})
	}
	return &pulumirpc.AnalyzerInfo{
		Name:           a.policyPackName,
		Policies:       policies,
		SupportsConfig: true,
		InitialConfig:  nil, /* TODO */
	}, nil
}

func (a *analyzerServer[T]) GetPluginInfo(context.Context, *pbempty.Empty) (*pulumirpc.PluginInfo, error) {
	return &pulumirpc.PluginInfo{
		Version: version.Version,
	}, nil
}

func (a *analyzerServer[T]) Configure(ctx context.Context, req *pulumirpc.ConfigureAnalyzerRequest) (*pbempty.Empty,
	error) {
	conf := map[string]interface{}{}
	for k, v := range req.PolicyConfig {
		pm, err := plugin.UnmarshalProperties(v.GetProperties(), plugin.MarshalOptions{
			Label:        fmt.Sprintf("%s.configure", a.policyPackName),
			KeepUnknowns: true,
		})
		conf[k] = pm.Mappable()
		if err != nil {
			return nil, err
		}
	}
	a.policyPackConfig = conf
	return &pbempty.Empty{}, nil
}
