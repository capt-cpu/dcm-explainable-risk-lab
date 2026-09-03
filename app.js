"use strict";

const examplePatient = {
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
};

const yesNo = [
  { value: 0, label: "No" },
  { value: 1, label: "Yes" },
];

const fields = [
  { key: "Age", label: "Age", unit: "years", type: "number", min: 18, max: 100, step: 1, group: "basic" },
  {
    key: "Sex",
    label: "Sex",
    type: "select",
    options: [
      { value: 0, label: "Female" },
      { value: 1, label: "Male" },
    ],
    group: "basic",
  },
  { key: "BMI", label: "BMI", unit: "kg/m²", type: "number", min: 10, max: 50, step: 0.1, group: "basic" },
  { key: "Duration", label: "Symptom duration", unit: "months", type: "number", min: 0, max: 300, step: 1, group: "basic" },
  { key: "VAS", label: "Neck pain VAS", unit: "points", type: "number", min: 0, max: 10, step: 1, group: "basic" },
  { key: "Cobb", label: "C2–7 Cobb angle", unit: "°", type: "number", min: -30, max: 60, step: 0.1, group: "imaging" },
  { key: "Segments", label: "Involved OPLL segments", unit: "segments", type: "number", min: 1, max: 8, step: 1, group: "imaging" },
  {
    key: "Type",
    label: "OPLL type",
    type: "select",
    options: [
      { value: "Localized", label: "Localized" },
      { value: "Segmental", label: "Segmental" },
      { value: "Continuous", label: "Continuous" },
      { value: "Mixed", label: "Mixed" },
    ],
    group: "imaging",
  },
  { key: "Occupancy", label: "Maximum canal occupancy", unit: "%", type: "number", min: 0, max: 100, step: 0.1, group: "imaging" },
  { key: "Signal", label: "Intramedullary T2 high signal", type: "select", options: yesNo, group: "imaging" },
  { key: "Diabetes", label: "Diabetes", type: "select", options: yesNo, group: "comorbidity" },
  { key: "Hypertension", label: "Hypertension", type: "select", options: yesNo, group: "comorbidity" },
  {
    key: "Region",
    label: "Birth region",
    type: "select",
    options: [
      { value: 0, label: "Southern China" },
      { value: 1, label: "Northern China" },
    ],
    group: "comorbidity",
  },
  { key: "Rheumatism", label: "Rheumatic disease", type: "select", options: yesNo, group: "comorbidity" },
];

const featureLabels = Object.fromEntries(fields.map((field) => [field.key, field.label]));
const form = document.querySelector("#patient-form");
const calculateButton = document.querySelector("#calculate");
const calculateLabel = document.querySelector("#calculate-label");
const errorBox = document.querySelector("#error");
let model = null;

function renderFields() {
  const targets = {
    basic: document.querySelector("#basic-fields"),
    imaging: document.querySelector("#imaging-fields"),
    comorbidity: document.querySelector("#comorbidity-fields"),
  };

  for (const field of fields) {
    const label = document.createElement("label");
    label.className = "field";
    label.htmlFor = field.key;

    const caption = document.createElement("span");
    caption.className = "field-label";
    caption.textContent = field.label;
    if (field.unit) {
      const unit = document.createElement("small");
      unit.textContent = field.unit;
      caption.append(unit);
    }
    label.append(caption);

    const input = document.createElement(field.type === "select" ? "select" : "input");
    input.id = field.key;
    input.name = field.key;
    input.dataset.kind = field.type;
    if (field.type === "select") {
      for (const optionData of field.options) {
        const option = document.createElement("option");
        option.value = String(optionData.value);
        option.textContent = optionData.label;
        input.append(option);
      }
    } else {
      input.type = "number";
      input.min = String(field.min);
      input.max = String(field.max);
      input.step = String(field.step);
      input.required = true;
    }
    label.append(input);
    targets[field.group].append(label);
  }
}

function setPatient(patient) {
  for (const field of fields) {
    document.querySelector(`#${field.key}`).value = String(patient[field.key]);
  }
}

function getPatient() {
  const patient = {};
  for (const field of fields) {
    const input = document.querySelector(`#${field.key}`);
    patient[field.key] =
      field.key === "Type" ? input.value : Number(input.value);
  }
  return patient;
}

function validatePatient(patient) {
  for (const field of fields) {
    if (field.type !== "number") continue;
    const value = patient[field.key];
    if (!Number.isFinite(value) || value < field.min || value > field.max) {
      throw new Error(`${field.label} must be between ${field.min} and ${field.max}${field.unit ? ` ${field.unit}` : ""}.`);
    }
  }
}

function forestValues(activeModel, patient) {
  const raw = {
    Age: patient.Age,
    Sex: patient.Sex,
    BMI: patient.BMI,
    Diabetes: patient.Diabetes,
    Hypertension: patient.Hypertension,
    Duration: patient.Duration,
    Cobb: patient.Cobb,
    Segments: patient.Segments,
    TypeSegmental: patient.Type === "Segmental" ? 1 : 0,
    TypeContinuous: patient.Type === "Continuous" ? 1 : 0,
    TypeMixed: patient.Type === "Mixed" ? 1 : 0,
    Occupancy: patient.Occupancy,
    Signal: patient.Signal,
    VAS: patient.VAS,
    Region: patient.Region,
    Rheumatism: patient.Rheumatism,
  };

  return Object.fromEntries(
    activeModel.forestFeatures.map((feature) => [
      feature,
      (raw[feature] - activeModel.center[feature]) / activeModel.scale[feature],
    ]),
  );
}

function predictForest(activeModel, patient) {
  const values = forestValues(activeModel, patient);
  const yesIndex = activeModel.classes.indexOf(activeModel.positiveClass) + 1;
  let yesVotes = 0;

  for (const tree of activeModel.trees) {
    let nodeIndex = 0;
    let guard = 0;
    while (guard < 256) {
      const node = tree[nodeIndex];
      if (!node) break;
      const [left, right, splitVariable, splitPoint, status, prediction] = node;
      if (status === -1) {
        if (prediction === yesIndex) yesVotes += 1;
        break;
      }
      const feature = activeModel.forestFeatures[splitVariable - 1];
      nodeIndex = values[feature] <= splitPoint ? left - 1 : right - 1;
      guard += 1;
    }
  }

  return yesVotes / activeModel.ntree;
}

function mulberry32(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function referenceShap(activeModel, patient, permutations = 32) {
  const keys = activeModel.inputFeatures;
  const contributions = Object.fromEntries(keys.map((key) => [key, 0]));
  const referencePatient = activeModel.defaults;
  const baseline = predictForest(activeModel, referencePatient);

  for (let round = 0; round < permutations; round += 1) {
    const random = mulberry32(20260728 + round * 97);
    const order = shuffled(keys, random);
    const current = { ...referencePatient };
    let previous = baseline;

    for (const key of order) {
      current[key] = patient[key];
      const next = predictForest(activeModel, current);
      contributions[key] += next - previous;
      previous = next;
    }
  }

  for (const key of keys) contributions[key] /= permutations;
  return { baseline, contributions };
}

function renderContributions(contributions) {
  const sorted = Object.entries(contributions)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 8);
  const maxContribution = Math.max(
    ...sorted.map(([, value]) => Math.abs(value)),
    0.001,
  );
  const list = document.querySelector("#contribution-list");
  list.replaceChildren();

  for (const [feature, value] of sorted) {
    const row = document.createElement("div");
    row.className = "contribution";

    const name = document.createElement("span");
    name.textContent = featureLabels[feature] || feature;

    const track = document.createElement("div");
    track.className = "bar-track";
    const bar = document.createElement("i");
    bar.className = value >= 0 ? "positive" : "negative";
    bar.style.width = `${Math.max(3, (Math.abs(value) / maxContribution) * 50)}%`;
    track.append(bar);

    const amount = document.createElement("strong");
    amount.className = value >= 0 ? "positive-text" : "negative-text";
    amount.textContent = `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}`;
    const unit = document.createElement("small");
    unit.textContent = "percentage points";
    amount.append(unit);

    row.append(name, track, amount);
    list.append(row);
  }
}

function renderResult(probability, explanation) {
  const percent = probability * 100;
  const high = probability >= 0.5;
  document.querySelector("#risk-value").textContent = `${percent.toFixed(1)}%`;
  document.querySelector("#risk-ring").style.background =
    `conic-gradient(#e45b4f ${percent * 3.6}deg, #e7edf0 0deg)`;
  document.querySelector("#threshold-fill").style.width = `${percent}%`;
  document.querySelector("#baseline-value").textContent =
    `${(explanation.baseline * 100).toFixed(1)}%`;
  document.querySelector("#current-value").textContent = `${percent.toFixed(1)}%`;

  const label = document.querySelector("#risk-label");
  label.textContent = high ? "At or above 0.50" : "Below 0.50";
  label.classList.toggle("high", high);
  renderContributions(explanation.contributions);
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

function calculate() {
  if (!model) return;
  calculateButton.disabled = true;
  calculateLabel.textContent = "Calculating…";
  showError("");

  window.setTimeout(() => {
    try {
      const patient = getPatient();
      validatePatient(patient);
      const probability = predictForest(model, patient);
      const explanation = referenceShap(model, patient);
      renderResult(probability, explanation);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Calculation failed. Please refresh and try again.");
    } finally {
      calculateButton.disabled = false;
      calculateLabel.textContent = "Calculate probability";
    }
  }, 30);
}

renderFields();
setPatient(examplePatient);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  calculate();
});

document.querySelector("#load-example").addEventListener("click", () => {
  setPatient(examplePatient);
  calculate();
});

async function fetchModelFile(url, compressed, timeoutMs = 45000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-cache",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`The model file could not be loaded (${response.status})`);

    if (!compressed) return response.json();
    if (!response.body || !("DecompressionStream" in window)) {
      throw new Error("This browser cannot decompress the model file");
    }

    const decompressed = response.body.pipeThrough(new DecompressionStream("gzip"));
    return new Response(decompressed).json();
  } finally {
    window.clearTimeout(timeout);
  }
}

async function loadModel() {
  const candidates = [];
  if ("DecompressionStream" in window) {
    candidates.push({
      url: "./model.json.gz?v=20260903",
      compressed: true,
      label: "Loading compressed model…",
    });
  }
  candidates.push({
    url: "./model.json?v=20260903",
    compressed: false,
    label: "Loading compatible model…",
  });

  let lastError = null;
  for (const candidate of candidates) {
    calculateLabel.textContent = candidate.label;
    try {
      return await fetchModelFile(candidate.url, candidate.compressed);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("The model file could not be loaded");
}

loadModel()
  .then((loadedModel) => {
    model = loadedModel;
    document.querySelector(".model-badge").textContent =
      `Locked RF · ${loadedModel.ntree.toLocaleString("en-US")} trees`;
    calculateButton.disabled = false;
    calculateLabel.textContent = "Calculate probability";
    calculate();
  })
  .catch((error) => {
    calculateLabel.textContent = "Model unavailable";
    showError(
      `${error instanceof Error ? error.message : "The model file could not be loaded"}. Check your connection and refresh the page.`,
    );
  });
