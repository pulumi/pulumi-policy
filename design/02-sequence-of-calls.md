# Policy API by example

In this text, we'll talk generally about the sequence of API calls required to validate a resource
against a bunch of policies, and to push information about validation failures to the Pulumi
service. As we will see, this contains two API boundaries: the gRPC API for the analyzer API (which
validates resources against the policies), and the Pulumi service API for receiving policy
violations.

## Step 1: The Analyzer API

The `StepGenerator`, broadly, is in charge of taking events from the running Pulumi program and
turning them into goal states and operations that Pulumi is supposed to drive towards.

Before any step can be executed, the goal state for the given resource must be validated against the
current analyzers (in this case including a `PolicyPack`).

Thus, the first API boundary we cross is the interface between the `StepGenerator` and the analyzer
plugins. This section will describe this API.

### `PolicyPack` is registered

The engine will lazily load the analyzer plugins as they are needed. Policies are implemented as
analyzer plugins, using the `PolicyPack` abstraction. The `PolicyPack` will start a gRPC server that
can respond to `Analyze(...)` RPC calls.

The code looks like this:

```typescript
const policies = new PolicyPack("k8s-sec-rules", {
    policies: [
        {
            name: "no-public-services",
            description: "No Kubernetes Service objects should have type `LoadBalancer`",
            message:
                "Security team requires all publicly-exposed services to go through audit and approval "
            tags: ["security"],
            enforcementLevel: "mandatory",
            rule: (type, svc) => {
                return type === "kubernetes:core/v1:Service" && svc.type === "LoadBalancer";
            },
        },
    ],
});
```

### `Analyze(...)` is called

When `RegisterResoruce` is called, the Pulumi engine will call the `Analyze(...)` RPC on each
analyzer -- in this case, there is just one analyzer, and it contains the `PolicyPack`.

The raw RPC request (i.e., beneath all the sugar) will look something like this:

```javascript
// Request
{
    Type: "kubernetes:core/v1:Service",
    Properties: { kind: "Service", apiVersion: "v1", ... },
}
```

The policy registered in the previous step will receive this property bag and validate it. In the
event of a failure, we would get the following response back.

```javascript
// Response: list of policy violations
{
    Diagnostics: [{
        ID:               "k8s-sec-rules/no-public-services",
        Description:      "No Kubernetes Service objects should have type `LoadBalancer`",
        Message:          "Security team requires all publicly-exposed services to go through audit and approval ",
        Tags:             ["security"],
        EnforcementLevel: "mandatory", // Technically, gRPC implements this field as an enum.
    }],
}
```

Note that this response does not contain the URN of the resource. In general, analyzer plugins don’t
know about URNs -- since the `StepGenerator` invoked `Analyze(...)`, it keeps track of the
additional metadata needed to communicate with the Pulumi service about what resources failed.

In the next section, we will see that the `StepGenerator` takes this diagnostic information and
marshals it into an _event_ representing a policy violation, which the Pulumi service can
understand.


## Step 2: The Pulumi service events API

As we mentioned in the previous section, when the `StepGenerator` calls `Analyze(...)` on a
particular goal state, it receives back only enough information to know that tthe goal state is
invalid. To make this useful to the Pulumi service, it must now convert this response into an
_event_ that contains enough information that the Pulumi service can understand it.

Thus, the second API boundary we reach is the event sink boundary.

### Results of `Analyze` are turned into a policy violation event

The response `Analyze` returned in the last step is converted by the `StepGenerator` into the
following event. Notably, it now contains:

1. The URN of the resource that failed validation
1. The ID of the policy (taking the form `<policy-pack-name>/<policy-name>`)
1. Information useful for printing and colorizing the message

> NOTE: If there were multiple policy violations, they would be "rendered" as multiple policy
> violation events, and each individually sent to the Pulumi service.

```typescript
{
    Type: "policy-violation",
    Payload: {
        URN              "<urn>",
        Message          "No Kubernetes Service objects should have type `LoadBalancer`: " +
            "Security team requires all publicly-exposed services to go through audit and approval ",
        Color            "<color>",
        ID               "k8s-sec-rules/no-public-services",
        EnforcementLevel "mandatory",
        Prefix           "<prefix>",
    }
}
```

### Policy violation event is sent to the Pulumi service

Finally, once this is converted to an event that the Pulumi service understands, it is sent to the
Pulumi service.