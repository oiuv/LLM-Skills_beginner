export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  triggers: string[];
  requiredTools: string[];
  risk: "low" | "medium" | "high";
}

export interface LoadedSkill {
  manifest: SkillManifest;
  instructions: string;
}

export class SkillRegistry {
  private readonly manifests = new Map<string, SkillManifest>();
  private readonly loaders = new Map<string, () => Promise<LoadedSkill>>();

  register(
    manifest: SkillManifest,
    loader: () => Promise<LoadedSkill>,
  ): void {
    if (this.manifests.has(manifest.name)) {
      throw new Error("Duplicate skill: " + manifest.name);
    }
    this.manifests.set(manifest.name, { ...manifest });
    this.loaders.set(manifest.name, loader);
  }

  find(query: string): SkillManifest[] {
    const normalized = query.toLowerCase();
    return [...this.manifests.values()]
      .filter(
        (manifest) =>
          manifest.name.toLowerCase().includes(normalized) ||
          manifest.description.toLowerCase().includes(normalized) ||
          manifest.triggers.some((trigger) =>
            normalized.includes(trigger.toLowerCase()),
          ),
      )
      .map((manifest) => ({ ...manifest }));
  }

  async load(name: string, availableTools: Set<string>): Promise<LoadedSkill> {
    const manifest = this.manifests.get(name);
    const loader = this.loaders.get(name);
    if (!manifest || !loader) throw new Error("Skill not found: " + name);

    const missing = manifest.requiredTools.filter(
      (tool) => !availableTools.has(tool),
    );
    if (missing.length > 0) {
      throw new Error("Missing required tools: " + missing.join(", "));
    }

    const skill = await loader();
    if (
      skill.manifest.name !== manifest.name ||
      skill.manifest.version !== manifest.version
    ) {
      throw new Error("Loaded skill does not match indexed manifest");
    }
    return skill;
  }
}

