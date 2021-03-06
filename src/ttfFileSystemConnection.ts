import { promises as fs } from "fs";
import * as protobuf from "google-protobuf";
import * as ttfArtifact from "./ttf/artifact_pb";
import * as ttfCore from "./ttf/core_pb";
import * as ttfTaxonomy from "./ttf/taxonomy_pb";
import * as uuid from "uuid";

import { ITtfInterface, ITtfError } from "./ttfInterface";

export class TtfFileSystemConnection implements ITtfInterface {
  static async create(snapshotPath: string): Promise<ITtfInterface> {
    const serializedData = await fs.readFile(snapshotPath);
    const taxonomy = ttfTaxonomy.Taxonomy.deserializeBinary(serializedData);
    return new TtfFileSystemConnection(taxonomy);
  }

  private constructor(private readonly taxonomy: ttfTaxonomy.Taxonomy) {}

  createArtifact(
    request: ttfArtifact.NewArtifactRequest,
    callback: (
      error: ITtfError | null,
      response: ttfArtifact.NewArtifactResponse
    ) => void
  ) {
    let done = false;
    const type = request.getType();
    const artifact = request.getArtifact();
    if (artifact) {
      switch (type) {
        case ttfArtifact.ArtifactType.TEMPLATE_DEFINITION:
          const definition = artifact.unpack(
            ttfCore.TemplateDefinition.deserializeBinary,
            "taxonomy.model.core.TemplateDefinition"
          );
          const id = definition?.getArtifact()?.getArtifactSymbol()?.getId();
          if (definition && id) {
            this.taxonomy.getTemplateDefinitionsMap().set(id, definition);
            const formula = this.taxonomy
              .getTemplateFormulasMap()
              .get(definition.getFormulaReference()?.getId() || "");
            this.insertIntoHierarchy(
              definition,
              formula,
              definition.getTokenBase()?.getReference()?.getId(),
              id
            );
            done = true;
            callback(null, new ttfArtifact.NewArtifactResponse());
          }
          break;
        case ttfArtifact.ArtifactType.TEMPLATE_FORMULA:
          const formula = artifact.unpack(
            ttfCore.TemplateFormula.deserializeBinary,
            "taxonomy.model.core.TemplateFormula"
          );
          const tooling = formula
            ?.getArtifact()
            ?.getArtifactSymbol()
            ?.getTooling();
          if (formula && tooling) {
            this.taxonomy.getTemplateFormulasMap().set(tooling, formula);
            done = true;
            callback(null, new ttfArtifact.NewArtifactResponse());
          }
          break;
        case ttfArtifact.ArtifactType.BEHAVIOR:
          const behavior = artifact.unpack(
            ttfCore.Behavior.deserializeBinary,
            "taxonomy.model.core.Behavior"
          );
          const behaviorId = behavior
            ?.getArtifact()
            ?.getArtifactSymbol()
            ?.getId();
          if (behavior && behaviorId) {
            this.taxonomy.getBehaviorsMap().set(behaviorId, behavior);
            done = true;
            callback(null, new ttfArtifact.NewArtifactResponse());
          }
          break;
        case ttfArtifact.ArtifactType.BEHAVIOR_GROUP:
          const behaviorGroup = artifact.unpack(
            ttfCore.BehaviorGroup.deserializeBinary,
            "taxonomy.model.core.BehaviorGroup"
          );
          const groupId = behaviorGroup
            ?.getArtifact()
            ?.getArtifactSymbol()
            ?.getId();
          if (behaviorGroup && groupId) {
            this.taxonomy.getBehaviorGroupsMap().set(groupId, behaviorGroup);
            done = true;
            callback(null, new ttfArtifact.NewArtifactResponse());
          }
          break;
        case ttfArtifact.ArtifactType.PROPERTY_SET:
          const propertySet = artifact.unpack(
            ttfCore.PropertySet.deserializeBinary,
            "taxonomy.model.core.PropertySet"
          );
          const setId = propertySet
            ?.getArtifact()
            ?.getArtifactSymbol()
            ?.getId();
          if (propertySet && setId) {
            this.taxonomy.getPropertySetsMap().set(setId, propertySet);
            done = true;
            callback(null, new ttfArtifact.NewArtifactResponse());
          }
          break;
        default:
          done = true;
          callback(
            `Artifact type not supported: ${type}`,
            new ttfArtifact.NewArtifactResponse()
          );
          break;
      }
    }
    if (!done) {
      callback(
        "Artifact could not be created",
        new ttfArtifact.NewArtifactResponse()
      );
    }
  }

  createTemplateDefinition(
    request: ttfArtifact.NewTemplateDefinition,
    callback: (
      error: ITtfError | null,
      response: ttfCore.TemplateDefinition
    ) => void
  ) {
    const definition = new ttfCore.TemplateDefinition();
    const formulaId = request.getTemplateFormulaId();
    let formula: ttfCore.TemplateFormula | undefined;
    this.taxonomy.getTemplateFormulasMap().forEach((_) => {
      if (_?.getArtifact()?.getArtifactSymbol()?.getId() === formulaId) {
        formula = _;
      }
    });
    if (formula) {
      let formulaArtifact = formula.getArtifact();
      if (!formulaArtifact) {
        formulaArtifact = new ttfArtifact.Artifact();
      }
      const formulaName = formulaArtifact.getName();
      const definitionName = request.getTokenName();

      const definitionArtifact = formulaArtifact.clone();
      definition.setArtifact(definitionArtifact);
      definitionArtifact
        .getArtifactFilesList()
        .map((_) =>
          _.setFileName(_.getFileName().replace(formulaName, definitionName))
        );
      definitionArtifact.setName(definitionName);

      let definitionArtifactSymbol = definitionArtifact.getArtifactSymbol();
      if (!definitionArtifactSymbol) {
        definitionArtifactSymbol = new ttfArtifact.ArtifactSymbol();
        definitionArtifact.setArtifactSymbol(definitionArtifactSymbol);
      }
      const definitionId = uuid.v1();
      definitionArtifactSymbol.setId(definitionId);
      definitionArtifactSymbol.setType(
        ttfArtifact.ArtifactType.TEMPLATE_DEFINITION
      );

      const formulaReferece = new ttfArtifact.ArtifactReference();
      definition.setFormulaReference(formulaReferece);
      formulaReferece.setId(formulaId);
      formulaReferece.setType(ttfArtifact.ArtifactType.TEMPLATE_FORMULA);
      formulaReferece.setReferenceNotes(formulaName);

      const baseTokenId = formula.getTokenBase()?.getBase()?.getId();
      if (baseTokenId) {
        const baseReference = new ttfCore.BaseReference();
        const reference = new ttfArtifact.ArtifactReference();
        reference.setId(baseTokenId);
        reference.setType(ttfArtifact.ArtifactType.BASE);
        baseReference.setReference(reference);
        definition.setTokenBase(baseReference);
      }

      formula
        .getBehaviorsList()
        .map((_) => _.getBehavior()?.getId())
        .filter((_) => !!_)
        .map((behaviorId) => {
          const behavior = this.taxonomy
            .getBehaviorsMap()
            .get(behaviorId as string);
          const behaviorReference = new ttfCore.BehaviorReference();
          behaviorReference.setPropertiesList([
            ...(behavior?.getPropertiesList() || []),
          ]);
          behaviorReference.setInvocationsList([
            ...(behavior?.getInvocationsList() || []),
          ]);
          behaviorReference.setIsExternal(true);
          const reference = new ttfArtifact.ArtifactReference();
          reference.setId(behaviorId as string);
          reference.setType(ttfArtifact.ArtifactType.BEHAVIOR);
          behaviorReference.setReference(reference);
          definition.addBehaviors(behaviorReference);
        });

      formula
        .getBehaviorGroupsList()
        .map((_) => _.getBehaviorGroup()?.getId())
        .filter((_) => !!_)
        .map((behaviorGroupId) => {
          const behaviorGroup = this.taxonomy
            .getBehaviorGroupsMap()
            .get(behaviorGroupId as string);
          const behaviorGroupReference = new ttfCore.BehaviorGroupReference();
          behaviorGroupReference.setBehaviorArtifactsList([
            ...(behaviorGroup?.getBehaviorsList() || []),
          ]);
          const reference = new ttfArtifact.ArtifactReference();
          reference.setId(behaviorGroupId as string);
          reference.setType(ttfArtifact.ArtifactType.BEHAVIOR_GROUP);
          behaviorGroupReference.setReference(reference);
          definition.addBehaviorGroups(behaviorGroupReference);
        });

      formula
        .getPropertySetsList()
        .map((_) => _.getPropertySet()?.getId())
        .filter((_) => !!_)
        .map((propertySetId) => {
          const propertySet = this.taxonomy
            .getPropertySetsMap()
            .get(propertySetId as string);
          const propertySetReference = new ttfCore.PropertySetReference();
          propertySetReference.setPropertiesList([
            ...(propertySet?.getPropertiesList() || []),
          ]);
          const reference = new ttfArtifact.ArtifactReference();
          reference.setId(propertySetId as string);
          reference.setType(ttfArtifact.ArtifactType.PROPERTY_SET);
          propertySetReference.setReference(reference);
          definition.addPropertySets(propertySetReference);
        });

      if (formula.getTemplateType() === ttfArtifact.TemplateType.HYBRID) {
        definition.getChildTokensList().map((_) => {
          // TODO: Repeat above logic recursively
        });
      }

      this.taxonomy.getTemplateDefinitionsMap().set(definitionId, definition);
      this.insertIntoHierarchy(definition, formula, baseTokenId, definitionId);
      callback(null, definition);
    } else {
      callback(`Formula ${formulaId} not found`, definition);
    }
  }

  deleteArtifact(
    request: ttfArtifact.DeleteArtifactRequest,
    callback: (error: ITtfError | null, response: any) => void
  ) {
    let done = false;
    const symbol = request.getArtifactSymbol();
    const type = symbol?.getType();
    const id = symbol?.getId();
    switch (type) {
      case ttfArtifact.ArtifactType.BASE:
        if (id) {
          this.taxonomy.getBaseTokenTypesMap().del(id);
          done = true;
          callback(null, {});
        }
        break;
      case ttfArtifact.ArtifactType.BEHAVIOR:
        if (id) {
          this.taxonomy.getBehaviorsMap().del(id);
          done = true;
          callback(null, {});
        }
        break;
      case ttfArtifact.ArtifactType.BEHAVIOR_GROUP:
        if (id) {
          this.taxonomy.getBehaviorGroupsMap().del(id);
          done = true;
          callback(null, {});
        }
        break;
      case ttfArtifact.ArtifactType.PROPERTY_SET:
        if (id) {
          this.taxonomy.getPropertySetsMap().del(id);
          done = true;
          callback(null, {});
        }
        break;
      case ttfArtifact.ArtifactType.TEMPLATE_DEFINITION:
        if (id) {
          this.taxonomy.getTemplateDefinitionsMap().del(id);
          this.taxonomy
            .getTokenTemplateHierarchy()
            ?.getFungibles()
            ?.getFractional()
            ?.getTemplates()
            ?.getTemplateMap()
            .del(id);
          this.taxonomy
            .getTokenTemplateHierarchy()
            ?.getFungibles()
            ?.getWhole()
            ?.getTemplates()
            ?.getTemplateMap()
            .del(id);
          this.taxonomy
            .getTokenTemplateHierarchy()
            ?.getHybrids()
            ?.getFungible()
            ?.getFractional()
            ?.getTemplates()
            ?.getTemplateMap()
            .del(id);
          this.taxonomy
            .getTokenTemplateHierarchy()
            ?.getHybrids()
            ?.getFungible()
            ?.getWhole()
            ?.getTemplates()
            ?.getTemplateMap()
            .del(id);
          this.taxonomy
            .getTokenTemplateHierarchy()
            ?.getHybrids()
            ?.getNonFungible()
            ?.getFractional()
            ?.getTemplates()
            ?.getTemplateMap()
            .del(id);
          this.taxonomy
            .getTokenTemplateHierarchy()
            ?.getHybrids()
            ?.getNonFungible()
            ?.getSingleton()
            ?.getTemplates()
            ?.getTemplateMap()
            .del(id);
          this.taxonomy
            .getTokenTemplateHierarchy()
            ?.getHybrids()
            ?.getNonFungible()
            ?.getWhole()
            ?.getTemplates()
            ?.getTemplateMap()
            .del(id);
          this.taxonomy
            .getTokenTemplateHierarchy()
            ?.getNonFungibles()
            ?.getFractional()
            ?.getTemplates()
            ?.getTemplateMap()
            .del(id);
          this.taxonomy
            .getTokenTemplateHierarchy()
            ?.getNonFungibles()
            ?.getSingleton()
            ?.getTemplates()
            ?.getTemplateMap()
            .del(id);
          this.taxonomy
            .getTokenTemplateHierarchy()
            ?.getNonFungibles()
            ?.getWhole()
            ?.getTemplates()
            ?.getTemplateMap()
            .del(id);
          done = true;
          callback(null, {});
        }
        break;
      case ttfArtifact.ArtifactType.TEMPLATE_FORMULA:
        this.taxonomy.getTemplateFormulasMap().forEach((formula, key) => {
          if (
            !done &&
            formula.getArtifact()?.getArtifactSymbol()?.getId() === id
          ) {
            this.taxonomy.getTemplateFormulasMap().del(key);
            done = true;
            callback(null, {});
          }
        });
        break;
      default:
        done = true;
        callback(`Artifact type not supported: ${type}`, {});
        break;
    }
    if (!done) {
      callback("Artifact could not be deleted", {});
    }
  }

  getFullTaxonomy(
    request: ttfTaxonomy.TaxonomyVersion,
    callback: (error: ITtfError | null, response: ttfTaxonomy.Taxonomy) => void
  ) {
    callback(null, this.taxonomy.clone());
  }

  getTemplateDefinitionArtifact(
    request: ttfArtifact.ArtifactSymbol,
    callback: (
      error: ITtfError | null,
      response: ttfCore.TemplateDefinition
    ) => void
  ) {
    let success = false;
    const id = request.getId();
    this.taxonomy.getTemplateDefinitionsMap().forEach((definition) => {
      if (
        !success &&
        definition.getArtifact()?.getArtifactSymbol()?.getId() === id
      ) {
        success = true;
        callback(null, definition.clone());
      }
    });
    if (!success) {
      callback(`Definition not found: ${id}`, new ttfCore.TemplateDefinition());
    }
  }

  getTemplateFormulaArtifact(
    request: ttfArtifact.ArtifactSymbol,
    callback: (
      error: ITtfError | null,
      response: ttfCore.TemplateFormula
    ) => void
  ) {
    let success = false;
    const tooling = request.getTooling();
    this.taxonomy.getTemplateFormulasMap().forEach((formula) => {
      if (
        !success &&
        formula.getArtifact()?.getArtifactSymbol()?.getTooling() === tooling
      ) {
        success = true;
        callback(null, formula.clone());
      }
    });
    if (!success) {
      callback(`Formula not found: ${tooling}`, new ttfCore.TemplateFormula());
    }
  }

  getBehaviorArtifact(
    request: ttfArtifact.ArtifactSymbol,
    callback: (error: ITtfError | null, response: ttfCore.Behavior) => void
  ) {
    this.getArtifact(
      request,
      this.taxonomy.getBehaviorsMap(),
      new ttfCore.Behavior(),
      callback
    );
  }

  getBehaviorGroupArtifact(
    request: ttfArtifact.ArtifactSymbol,
    callback: (error: ITtfError | null, response: ttfCore.BehaviorGroup) => void
  ) {
    this.getArtifact(
      request,
      this.taxonomy.getBehaviorGroupsMap(),
      new ttfCore.BehaviorGroup(),
      callback
    );
  }

  getPropertySetArtifact(
    request: ttfArtifact.ArtifactSymbol,
    callback: (error: ITtfError | null, response: ttfCore.PropertySet) => void
  ) {
    this.getArtifact(
      request,
      this.taxonomy.getPropertySetsMap(),
      new ttfCore.PropertySet(),
      callback
    );
  }

  getBaseArtifact(
    request: ttfArtifact.ArtifactSymbol,
    callback: (error: ITtfError | null, response: ttfCore.Base) => void
  ) {
    this.getArtifact(
      request,
      this.taxonomy.getBaseTokenTypesMap(),
      new ttfCore.Base(),
      callback
    );
  }

  updateArtifact(
    request: ttfArtifact.UpdateArtifactRequest,
    callback: (error: ITtfError | null, response: any) => void
  ) {
    try {
      let done = false;
      const type = request.getType();
      const packed = request.getArtifactTypeObject();
      if (packed) {
        switch (type) {
          case ttfArtifact.ArtifactType.TEMPLATE_DEFINITION:
            const definition = ttfCore.TemplateDefinition.deserializeBinary(
              packed.serializeBinary()
            );
            const id = definition.getArtifact()?.getArtifactSymbol()?.getId();
            if (id) {
              this.taxonomy.getTemplateDefinitionsMap().set(id, definition);
              done = true;
            }
            break;
          case ttfArtifact.ArtifactType.TEMPLATE_FORMULA:
            const formula = ttfCore.TemplateFormula.deserializeBinary(
              packed.serializeBinary()
            );
            const tooling = formula
              .getArtifact()
              ?.getArtifactSymbol()
              ?.getTooling();
            if (tooling) {
              this.taxonomy.getTemplateFormulasMap().set(tooling, formula);
              done = true;
            }
            break;
          case ttfArtifact.ArtifactType.BEHAVIOR:
            const behavior = packed.unpack(
              ttfCore.Behavior.deserializeBinary,
              packed.getTypeName()
            );
            const behaviorId = behavior
              ?.getArtifact()
              ?.getArtifactSymbol()
              ?.getId();
            if (behavior && behaviorId) {
              this.taxonomy.getBehaviorsMap().set(behaviorId, behavior);
              done = true;
            }
            break;
          case ttfArtifact.ArtifactType.BEHAVIOR_GROUP:
            const behaviorGroup = packed.unpack(
              ttfCore.BehaviorGroup.deserializeBinary,
              packed.getTypeName()
            );
            const behaviorGroupId = behaviorGroup
              ?.getArtifact()
              ?.getArtifactSymbol()
              ?.getId();
            if (behaviorGroup && behaviorGroupId) {
              this.taxonomy
                .getBehaviorGroupsMap()
                .set(behaviorGroupId, behaviorGroup);
              done = true;
            }
            break;
          case ttfArtifact.ArtifactType.BASE:
            const base = packed.unpack(
              ttfCore.Base.deserializeBinary,
              packed.getTypeName()
            );
            const baseId = base?.getArtifact()?.getArtifactSymbol()?.getId();
            if (base && baseId) {
              this.taxonomy.getBaseTokenTypesMap().set(baseId, base);
              done = true;
            }
            break;
          case ttfArtifact.ArtifactType.PROPERTY_SET:
            const propertySet = packed.unpack(
              ttfCore.PropertySet.deserializeBinary,
              packed.getTypeName()
            );
            const propertySetId = propertySet
              ?.getArtifact()
              ?.getArtifactSymbol()
              ?.getId();
            if (propertySet && propertySetId) {
              this.taxonomy
                .getPropertySetsMap()
                .set(propertySetId, propertySet);
              done = true;
            }
            break;
          default:
            done = true;
            callback(`Artifact type not supported: ${type}`, {});
            break;
        }
      }
      if (done) {
        callback(null, {});
      } else {
        callback("Artifact could not be updated", {});
      }
    } catch (e) {
      callback(e.message || "Exception", {});
    }
  }

  private getArtifact<
    T extends {
      getArtifact(): ttfArtifact.Artifact | undefined;
      clone(): T;
    }
  >(
    request: ttfArtifact.ArtifactSymbol,
    map: protobuf.Map<string, T>,
    defaultValue: T,
    callback: (error: ITtfError | null, response: T) => void
  ) {
    let success = false;
    const id = request.getId();
    map.forEach((_) => {
      if (!success && _.getArtifact()?.getArtifactSymbol()?.getId() === id) {
        success = true;
        callback(null, _.clone());
      }
    });
    if (!success) {
      callback(`Behavior not found: ${id}`, defaultValue);
    }
  }

  private insertIntoHierarchy(
    definition: ttfCore.TemplateDefinition,
    formula: ttfCore.TemplateFormula | undefined,
    baseTokenId: string | undefined,
    definitionId: string
  ) {
    const hierarchy = this.taxonomy.getTokenTemplateHierarchy();
    if (hierarchy) {
      const template = new ttfCore.TokenTemplate();
      template.setDefinition(definition);
      template.setFormula(formula);
      let topBranch = hierarchy.getFungibles();
      const baseName = this.taxonomy
        .getBaseTokenTypesMap()
        .get(baseTokenId || "")
        ?.getArtifact()
        ?.getName()
        .toLowerCase();
      if (baseName?.indexOf("non-fungible") !== -1) {
        topBranch = hierarchy.getNonFungibles();
      }
      let insertationPoint = topBranch?.getWhole();
      if (baseName?.indexOf("fractional") !== -1) {
        insertationPoint = topBranch?.getFractional();
      }
      insertationPoint
        ?.getTemplates()
        ?.getTemplateMap()
        .set(definitionId, template);
    }
  }
}
