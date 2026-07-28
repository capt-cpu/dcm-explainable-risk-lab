import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const model = JSON.parse(fs.readFileSync("model.json", "utf8"));

function predict(patient) {
  const raw = {
    ...patient,
    TypeSegmental: patient.Type === "Segmental" ? 1 : 0,
    TypeContinuous: patient.Type === "Continuous" ? 1 : 0,
    TypeMixed: patient.Type === "Mixed" ? 1 : 0,
  };
  const values = Object.fromEntries(
    model.forestFeatures.map((feature) => [
      feature,
      (raw[feature] - model.center[feature]) / model.scale[feature],
    ]),
  );
  const positiveIndex = model.classes.indexOf(model.positiveClass) + 1;
  let votes = 0;

  for (const tree of model.trees) {
    let nodeIndex = 0;
    while (true) {
      const [left, right, variable, point, status, prediction] = tree[nodeIndex];
      if (status === -1) {
        if (prediction === positiveIndex) votes += 1;
        break;
      }
      const feature = model.forestFeatures[variable - 1];
      nodeIndex = values[feature] <= point ? left - 1 : right - 1;
    }
  }
  return votes / model.ntree;
}

test("公开模型仅包含推理所需的汇总结构", () => {
  assert.deepEqual(
    Object.keys(model).sort(),
    [
      "center",
      "classes",
      "defaults",
      "forestFeatures",
      "globalImportance",
      "inputFeatures",
      "ntree",
      "outcome",
      "positiveClass",
      "ranges",
      "scale",
      "trees",
      "typeLevels",
      "version",
    ].sort(),
  );
  assert.equal(model.ntree, 800);
});

test("示例病例与R模型的概率一致", () => {
  const probability = predict({
    Age: 65,
    Sex: 1,
    BMI: 25,
    Diabetes: 1,
    Hypertension: 1,
    Duration: 36,
    Cobb: 8,
    Segments: 4,
    Type: "Mixed",
    Occupancy: 60,
    Signal: 1,
    VAS: 5,
    Region: 1,
    Rheumatism: 0,
  });
  assert.equal(probability, 0.715);
});
