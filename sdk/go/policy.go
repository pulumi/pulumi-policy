package policy

import (
	"context"
	"fmt"

	pbempty "github.com/golang/protobuf/ptypes/empty"
	"github.com/pulumi/pulumi/sdk/v3/go/common/resource/plugin"
	"github.com/pulumi/pulumi/sdk/v3/go/common/util/rpcutil"
	pulumirpc "github.com/pulumi/pulumi/sdk/v3/proto/go"
	"google.golang.org/grpc"
)

func PolicyPack(name string) error {
	// Fire up a gRPC server, letting the kernel choose a free port for us.
	port, done, err := rpcutil.Serve(0, nil, []func(*grpc.Server) error{
		func(srv *grpc.Server) error {
			analyzer := &analyzerServer{}
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

type analyzerServer struct {
	analyzer plugin.Analyzer
}

func (a *analyzerServer) Analyze(context.Context, *pulumirpc.AnalyzeRequest) (*pulumirpc.AnalyzeResponse, error) {
	return nil, fmt.Errorf("not yet implemented")
}

func (a *analyzerServer) AnalyzeStack(context.Context, *pulumirpc.AnalyzeStackRequest) (*pulumirpc.AnalyzeResponse, error) {
	return nil, fmt.Errorf("not yet implemented")
}

func (a *analyzerServer) GetAnalyzerInfo(context.Context, *pbempty.Empty) (*pulumirpc.AnalyzerInfo, error) {
	return nil, fmt.Errorf("not yet implemented")
}

func (a *analyzerServer) GetPluginInfo(context.Context, *pbempty.Empty) (*pulumirpc.PluginInfo, error) {
	return nil, fmt.Errorf("not yet implemented")
}

func (a *analyzerServer) Configure(context.Context, *pulumirpc.ConfigureAnalyzerRequest) (*pbempty.Empty, error) {
	return nil, fmt.Errorf("not yet implemented")
}
