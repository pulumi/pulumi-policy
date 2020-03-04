// Copyright 2016-2020, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

export interface PolicyConfigJSONSchema {
    type?: PolicyConfigJSONSchemaTypeName | PolicyConfigJSONSchemaTypeName[];
    enum?: PolicyConfigJSONSchemaType[];
    const?: PolicyConfigJSONSchemaType;

    multipleOf?: number;
    maximum?: number;
    exclusiveMaximum?: number;
    minimum?: number;
    exclusiveMinimum?: number;

    maxLength?: number;
    minLength?: number;
    pattern?: string;

    items?: PolicyConfigJSONSchemaDefinition | PolicyConfigJSONSchemaDefinition[];
    additionalItems?: PolicyConfigJSONSchemaDefinition;
    maxItems?: number;
    minItems?: number;
    uniqueItems?: boolean;
    contains?: PolicyConfigJSONSchema;

    maxProperties?: number;
    minProperties?: number;
    required?: string[];
    properties?: {
        [key: string]: PolicyConfigJSONSchemaDefinition;
    };
    patternProperties?: {
        [key: string]: PolicyConfigJSONSchemaDefinition;
    };
    additionalProperties?: PolicyConfigJSONSchemaDefinition;
    dependencies?: {
        [key: string]: PolicyConfigJSONSchemaDefinition | string[];
    };
    propertyNames?: PolicyConfigJSONSchemaDefinition;

    format?: string;

    description?: string;
    default?: PolicyConfigJSONSchemaType;
}

export type PolicyConfigJSONSchemaDefinition = PolicyConfigJSONSchema | boolean;

export type PolicyConfigJSONSchemaTypeName =
    "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";

export type PolicyConfigJSONSchemaType = PolicyConfigJSONSchemaType[] | boolean | number | null | object | string;
