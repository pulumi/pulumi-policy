// Copyright 2016-2021, Pulumi Corporation.  All rights reserved.

package main

import (
	"context"
	"reflect"

	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

type Bar struct {
	Keepers map[string]interface{} `pulumi:"keepers"`
}

type BarInput interface {
	pulumi.Input

	ToBarOutput() BarOutput
	ToBarOutputWithContext(context.Context) BarOutput
}

type BarArgs struct {
	Keepers pulumi.StringMapInput `pulumi:"keepers"`
}

func (BarArgs) ElementType() reflect.Type {
	return reflect.TypeOf((*Bar)(nil)).Elem()
}

func (i BarArgs) ToBarOutput() BarOutput {
	return i.ToBarOutputWithContext(context.Background())
}

func (i BarArgs) ToBarOutputWithContext(ctx context.Context) BarOutput {
	return pulumi.ToOutputWithContext(ctx, i).(BarOutput)
}

func (i BarArgs) ToBarPtrOutput() BarPtrOutput {
	return i.ToBarPtrOutputWithContext(context.Background())
}

func (i BarArgs) ToBarPtrOutputWithContext(ctx context.Context) BarPtrOutput {
	return pulumi.ToOutputWithContext(ctx, i).(BarOutput).ToBarPtrOutputWithContext(ctx)
}

type BarPtrInput interface {
	pulumi.Input

	ToBarPtrOutput() BarPtrOutput
	ToBarPtrOutputWithContext(context.Context) BarPtrOutput
}

type barPtrType BarArgs

func BarPtr(v *BarArgs) BarPtrInput {
	return (*barPtrType)(v)
}

func (*barPtrType) ElementType() reflect.Type {
	return reflect.TypeOf((**Bar)(nil)).Elem()
}

func (i *barPtrType) ToBarPtrOutput() BarPtrOutput {
	return i.ToBarPtrOutputWithContext(context.Background())
}

func (i *barPtrType) ToBarPtrOutputWithContext(ctx context.Context) BarPtrOutput {
	return pulumi.ToOutputWithContext(ctx, i).(BarPtrOutput)
}

type BarOutput struct{ *pulumi.OutputState }

func (BarOutput) ElementType() reflect.Type {
	return reflect.TypeOf((*Bar)(nil)).Elem()
}

func (o BarOutput) ToBarOutput() BarOutput {
	return o
}

func (o BarOutput) ToBarOutputWithContext(ctx context.Context) BarOutput {
	return o
}

func (o BarOutput) ToBarPtrOutput() BarPtrOutput {
	return o.ToBarPtrOutputWithContext(context.Background())
}

func (o BarOutput) ToBarPtrOutputWithContext(ctx context.Context) BarPtrOutput {
	return o.ApplyTWithContext(ctx, func(_ context.Context, v Bar) *Bar {
		return &v
	}).(BarPtrOutput)
}

type BarPtrOutput struct{ *pulumi.OutputState }

func (BarPtrOutput) ElementType() reflect.Type {
	return reflect.TypeOf((**Bar)(nil)).Elem()
}

func (o BarPtrOutput) ToBarPtrOutput() BarPtrOutput {
	return o
}

func (o BarPtrOutput) ToBarPtrOutputWithContext(ctx context.Context) BarPtrOutput {
	return o
}

func (o BarPtrOutput) Elem() BarOutput {
	return o.ApplyT(func(v *Bar) Bar {
		if v != nil {
			return *v
		}
		var ret Bar
		return ret
	}).(BarOutput)
}

func init() {
	pulumi.RegisterInputType(reflect.TypeOf((*BarInput)(nil)).Elem(), BarArgs{})
	pulumi.RegisterInputType(reflect.TypeOf((*BarPtrInput)(nil)).Elem(), BarArgs{})
	pulumi.RegisterOutputType(BarOutput{})
	pulumi.RegisterOutputType(BarPtrOutput{})
}
