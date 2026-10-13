import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { gunzipSync } from "node:zlib";

const model = JSON.parse(fs.readFileSync("model.json", "utf8"));
const validationCases = JSON.parse(
  fs.readFileSync("tests/model-validation-cases.json", "utf8"),
);

// Exercise the production predictor and explanation code directly. Only DOM
// wiring and automatic model loading are excluded from this Node context.
const appSource = fs.readFileSync("app.js", "utf8");
const context = vm.createContext({ document: { querySelector: () => ({}) } });
vm.runInContext(appSource.slice(0, appSource.indexOf("\nrenderFields();")), context);
const predict = (patient) => context.predictForest(model, patient);
const expectedFeatures = ["Age", "BMI", "Duration", "Cobb", "Segments", "Type",
  "Occupancy", "Signal", "VAS", "Region"];

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
  assert.equal(model.version, "locked-2026-10-13");
  assert.equal(model.outcome, "Severe neurological status: preoperative mJOA <= 11");
  assert.equal(model.ntree, 1000);
  assert.equal(model.mtry, 2);
  assert.equal(model.trainingN, 1410);
  assert.equal(model.cvFolds, 5);
  assert.equal(model.cvRepeats, 5);
  assert.deepEqual(model.inputFeatures, expectedFeatures);
  assert.equal(model.forestFeatures.length, 12);
  assert.equal(model.trees.length, model.ntree);
  assert.deepEqual(Object.keys(model.defaults), expectedFeatures);
});

test("all ten displayed fields correspond to the locked model", () => {
  const displayed = JSON.parse(vm.runInContext("JSON.stringify(fields.map(f => f.key))", context));
  assert.deepEqual(displayed.sort(), [...expectedFeatures].sort());
  const excluded = ["Sex", "Diabetes", "Hypertension", "Rheumatism"];
  for (const feature of excluded) assert.ok(!appSource.includes(`key: "${feature}"`));
  for (const { patient } of validationCases) {
    assert.equal(predict(patient), predict({ ...patient, Sex: 1, Diabetes: 1,
      Hypertension: 1, Rheumatism: 1 }));
  }
});

test("reference contributions use ten features and reconstruct the probability", () => {
  for (const { patient, expectedProbability } of validationCases) {
    const { baseline, contributions } = context.referenceShap(model, patient);
    assert.deepEqual(Object.keys(contributions), expectedFeatures);
    const total = baseline + Object.values(contributions).reduce((sum, value) => sum + value, 0);
    assert.ok(Math.abs(total - expectedProbability) < 1e-12);
  }
});

test("compressed and compatibility model files are identical", () => {
  assert.deepEqual(gunzipSync(fs.readFileSync("model.json.gz")), fs.readFileSync("model.json"));
});

// Private verification inputs can be supplied locally; they are never part of
// the public repository or build output.
test("all supplied validation-cohort probabilities match R exactly", {
  skip: !process.env.OPLL_PRIVATE_VALIDATION,
}, () => {
  const cases = JSON.parse(fs.readFileSync(process.env.OPLL_PRIVATE_VALIDATION, "utf8"));
  assert.equal(cases.length, 1133);
  for (const { patient, expectedProbability } of cases) assert.equal(predict(patient), expectedProbability);
});

test("browser probabilities match the locked R model", () => {
  for (const { patient, expectedProbability } of validationCases) {
    assert.equal(predict(patient), expectedProbability);
  }
});
