import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const model = JSON.parse(fs.readFileSync("model.json", "utf8"));
const validationCases = JSON.parse(
  fs.readFileSync("tests/model-validation-cases.json", "utf8"),
);

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

test("the public model contains only the locked inference structure", () => {
  assert.deepEqual(
    Object.keys(model).sort(),
    [
      "center",
      "classes",
      "cvFolds",
      "cvRepeats",
      "defaults",
      "forestFeatures",
      "globalImportance",
      "inputFeatures",
      "mtry",
      "ntree",
      "outcome",
      "positiveClass",
      "ranges",
      "scale",
      "trainingN",
      "trees",
      "typeLevels",
      "version",
    ].sort(),
  );
  assert.equal(model.version, "locked-2026-09-01");
  assert.equal(model.outcome, "Severe neurological status: preoperative mJOA <= 11");
  assert.equal(model.ntree, 1000);
  assert.equal(model.mtry, 2);
  assert.equal(model.trainingN, 1410);
  assert.equal(model.cvFolds, 5);
  assert.equal(model.cvRepeats, 5);
});

test("browser probabilities match the locked R model", () => {
  for (const { patient, expectedProbability } of validationCases) {
    assert.equal(predict(patient), expectedProbability);
  }
});
