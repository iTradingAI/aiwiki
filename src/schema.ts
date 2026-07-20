export type AiwikiSchemaStatus = "active" | "reserved";
export type AiwikiSchemaStorage = "workspace_config" | "markdown_frontmatter" | "json_output" | "json_input" | "extension_contract" | "reserved";
export type AiwikiSchemaCompatibilityPolicy = "additive_fields_only" | "strict_input_version" | "reserved";

export type AiwikiSchemaDefinition = {
  id: string;
  status: AiwikiSchemaStatus;
  aliases: readonly string[];
  storage: AiwikiSchemaStorage;
  compatibility: AiwikiSchemaCompatibilityPolicy;
};

export const AIWIKI_SCHEMAS = {
  workspace: {
    id: "aiwiki.workspace.v1",
    status: "active",
    aliases: ["1"],
    storage: "workspace_config",
    compatibility: "additive_fields_only"
  },
  artifact: {
    id: "aiwiki.artifact.v1",
    status: "active",
    aliases: [],
    storage: "markdown_frontmatter",
    compatibility: "additive_fields_only"
  },
  capsule: {
    id: "aiwiki.capsule.v1",
    status: "active",
    aliases: [],
    storage: "markdown_frontmatter",
    compatibility: "additive_fields_only"
  },
  lifecycle: {
    id: "aiwiki.lifecycle.v1",
    status: "active",
    aliases: [],
    storage: "markdown_frontmatter",
    compatibility: "additive_fields_only"
  },
  relationships: {
    id: "aiwiki.relationships.v1",
    status: "active",
    aliases: [],
    storage: "markdown_frontmatter",
    compatibility: "additive_fields_only"
  },
  stateArtifacts: {
    id: "aiwiki.state.artifacts.v1",
    status: "active",
    aliases: [],
    storage: "json_output",
    compatibility: "additive_fields_only"
  },
  stateCapsules: {
    id: "aiwiki.state.capsules.v1",
    status: "active",
    aliases: [],
    storage: "json_output",
    compatibility: "additive_fields_only"
  },
  stateRelationships: {
    id: "aiwiki.state.relationships.v1",
    status: "active",
    aliases: [],
    storage: "json_output",
    compatibility: "additive_fields_only"
  },
  stateLifecycle: {
    id: "aiwiki.state.lifecycle.v1",
    status: "active",
    aliases: [],
    storage: "json_output",
    compatibility: "additive_fields_only"
  },
  stateIndex: {
    id: "aiwiki.index.v1",
    status: "active",
    aliases: [],
    storage: "json_output",
    compatibility: "additive_fields_only"
  },
  stateGraph: {
    id: "aiwiki.graph.v1",
    status: "active",
    aliases: [],
    storage: "json_output",
    compatibility: "additive_fields_only"
  },
  context: {
    id: "aiwiki.context.v1",
    status: "active",
    aliases: [],
    storage: "json_output",
    compatibility: "additive_fields_only"
  },
  capsuleContext: {
    id: "aiwiki.context.capsule.v1",
    status: "active",
    aliases: [],
    storage: "json_output",
    compatibility: "additive_fields_only"
  },
  agentPayload: {
    id: "aiwiki.agent_payload.v1",
    status: "active",
    aliases: [],
    storage: "json_input",
    compatibility: "strict_input_version"
  },
  agentSync: {
    id: "aiwiki.agent_sync.v1",
    status: "active",
    aliases: [],
    storage: "json_output",
    compatibility: "additive_fields_only"
  },
  agentCheck: {
    id: "aiwiki.agent_check.v1",
    status: "active",
    aliases: [],
    storage: "json_output",
    compatibility: "additive_fields_only"
  },
  contextV2: {
    id: "aiwiki.context.v2",
    status: "active",
    aliases: [],
    storage: "json_output",
    compatibility: "additive_fields_only"
  },
  health: {
    id: "aiwiki.health.v1",
    status: "active",
    aliases: [],
    storage: "json_output",
    compatibility: "additive_fields_only"
  },
  healthReport: {
    id: "aiwiki.health_report.v1",
    status: "active",
    aliases: [],
    storage: "json_output",
    compatibility: "additive_fields_only"
  },
  repairPlan: {
    id: "aiwiki.repair_plan.v1",
    status: "active",
    aliases: [],
    storage: "json_output",
    compatibility: "additive_fields_only"
  },
  extension: {
    id: "aiwiki.extension.v1",
    status: "active",
    aliases: [],
    storage: "extension_contract",
    compatibility: "additive_fields_only"
  }
} as const satisfies Record<string, AiwikiSchemaDefinition>;

export type AiwikiSchemaKey = keyof typeof AIWIKI_SCHEMAS;
export type SchemaCompatibilityStatus = "compatible" | "unsupported_major" | "invalid";

export type SchemaCompatibility = {
  schemaId: string;
  suppliedVersion?: string;
  status: SchemaCompatibilityStatus;
  canonicalVersion: string;
  writable: boolean;
  reason: string;
};

export function schemaId<K extends AiwikiSchemaKey>(key: K): (typeof AIWIKI_SCHEMAS)[K]["id"] {
  return AIWIKI_SCHEMAS[key].id;
}

export function assessSchemaCompatibility(key: AiwikiSchemaKey, suppliedVersion?: unknown): SchemaCompatibility {
  const definition: AiwikiSchemaDefinition = AIWIKI_SCHEMAS[key];
  const supplied = normalizeVersion(suppliedVersion);

  if (definition.status === "reserved") {
    return {
      schemaId: definition.id,
      ...(supplied ? { suppliedVersion: supplied } : {}),
      status: "unsupported_major",
      canonicalVersion: definition.id,
      writable: false,
      reason: "reserved schema is not enabled"
    };
  }

  if (!supplied) {
    return {
      schemaId: definition.id,
      status: "compatible",
      canonicalVersion: definition.id,
      writable: true,
      reason: "schema version omitted; active v1 reader is assumed"
    };
  }

  const aliases: readonly string[] = definition.aliases;
  if (supplied === definition.id || aliases.includes(supplied)) {
    return {
      schemaId: definition.id,
      suppliedVersion: supplied,
      status: "compatible",
      canonicalVersion: definition.id,
      writable: true,
      reason: supplied === definition.id ? "accepted canonical schema version" : "accepted legacy alias"
    };
  }

  if (sameSchemaFamily(definition.id, supplied)) {
    return {
      schemaId: definition.id,
      suppliedVersion: supplied,
      status: "unsupported_major",
      canonicalVersion: definition.id,
      writable: false,
      reason: "unsupported schema major version"
    };
  }

  if (key === "workspace" && /^\d+$/.test(supplied)) {
    return {
      schemaId: definition.id,
      suppliedVersion: supplied,
      status: "unsupported_major",
      canonicalVersion: definition.id,
      writable: false,
      reason: "unsupported schema major version"
    };
  }

  return {
    schemaId: definition.id,
    suppliedVersion: supplied,
    status: "invalid",
    canonicalVersion: definition.id,
    writable: false,
    reason: "unrecognized schema version"
  };
}

function normalizeVersion(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return unquoteVersion(value.trim());
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function unquoteVersion(value: string): string {
  if (value.length < 2) {
    return value;
  }
  const first = value[0];
  const last = value[value.length - 1];
  return (first === '"' && last === '"') || (first === "'" && last === "'") ? value.slice(1, -1) : value;
}

function sameSchemaFamily(canonical: string, supplied: string): boolean {
  const prefix = canonical.replace(/v\d+$/, "");
  return new RegExp(`^${escapeRegExp(prefix)}v\\d+$`).test(supplied);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
