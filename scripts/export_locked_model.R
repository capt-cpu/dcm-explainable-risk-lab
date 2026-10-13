options(stringsAsFactors = FALSE)
Sys.setlocale("LC_CTYPE", "English_United States.utf8")

bundle_path <- Sys.getenv("OPLL_MODEL_BUNDLE")
if (!nzchar(bundle_path)) stop("Set OPLL_MODEL_BUNDLE to the locked RF10 RDS file.")
output_directory <- Sys.getenv("OPLL_MODEL_OUTPUT", unset = ".")
dir.create(file.path(output_directory, "tests"), recursive = TRUE, showWarnings = FALSE)

bundle <- readRDS(bundle_path)
fit <- bundle$fit
rf <- fit$finalModel
features <- bundle$features
training <- fit$trainingData[, features, drop = FALSE]

stopifnot(
  identical(bundle$algorithm, "RF"),
  identical(bundle$set, "Combined"),
  identical(bundle$role, "Global1SE"),
  identical(features, c("Age", "BMI", "Duration", "Cobb", "Segments", "Type",
                        "Occupancy", "Signal", "VAS", "Region")),
  nrow(training) == 1410L,
  rf$ntree == 1000L,
  fit$bestTune$mtry == 2,
  fit$control$number == 5L,
  fit$control$repeats == 5L,
  identical(unname(rf$classes), c("Yes", "No"))
)

mode_value <- function(x) {
  values <- table(x, useNA = "no")
  names(values)[which.max(values)]
}

defaults <- lapply(training, function(x) {
  if (is.factor(x) || is.character(x)) {
    return(mode_value(x))
  }
  if (all(stats::na.omit(x) %in% c(0, 1))) {
    return(as.numeric(mode_value(x)))
  }
  stats::median(x, na.rm = TRUE)
})

ranges <- lapply(training, function(x) {
  if (is.factor(x)) {
    return(unname(levels(x)))
  }
  if (is.character(x)) {
    return(unname(sort(unique(x))))
  }
  unname(range(x, na.rm = TRUE))
})

trees <- lapply(seq_len(rf$ntree), function(k) {
  tree <- randomForest::getTree(rf, k = k, labelVar = FALSE)
  lapply(seq_len(nrow(tree)), function(i) unname(as.numeric(tree[i, ])))
})

importance_raw <- randomForest::importance(rf, type = 2)
importance_vector <- as.numeric(importance_raw[, 1])
names(importance_vector) <- rownames(importance_raw)
feature_importance <- vapply(features, function(feature) {
  if (feature == "Type") {
    return(sum(importance_vector[grepl("^Type", names(importance_vector))]))
  }
  unname(importance_vector[feature])
}, numeric(1))

model <- list(
  version = "locked-2026-10-13",
  outcome = "Severe neurological status: preoperative mJOA <= 11",
  classes = unname(rf$classes),
  positiveClass = "Yes",
  ntree = rf$ntree,
  mtry = unname(fit$bestTune$mtry),
  trainingN = nrow(training),
  cvFolds = fit$control$number,
  cvRepeats = fit$control$repeats,
  forestFeatures = unname(names(rf$forest$ncat)),
  center = as.list(fit$preProcess$mean),
  scale = as.list(fit$preProcess$std),
  inputFeatures = unname(features),
  typeLevels = unname(fit$xlevels$Type),
  defaults = defaults,
  ranges = ranges,
  globalImportance = as.list(feature_importance),
  trees = trees
)

jsonlite::write_json(
  model,
  path = file.path(output_directory, "model.json"),
  auto_unbox = TRUE,
  digits = 16,
  pretty = FALSE,
  null = "null"
)

validation_patients <- data.frame(
  Age = c(65, 50, 72, 44, 60, 78, 55, 68),
  BMI = c(25, 21.5, 28.2, 23.1, 26.4, 19.8, 31.0, 24.0),
  Duration = c(36, 6, 120, 12, 48, 180, 24, 60),
  Cobb = c(8, 18, -5, 25, 10, 2, 16, 5),
  Segments = c(4, 2, 6, 1, 3, 5, 2, 4),
  Type = factor(
    c("Mixed", "Localized", "Continuous", "Segmental", "Mixed", "Continuous", "Localized", "Segmental"),
    levels = fit$xlevels$Type
  ),
  Occupancy = c(60, 25, 72, 18, 45, 68, 35, 52),
  Signal = c(1, 0, 1, 0, 1, 1, 0, 1),
  VAS = c(5, 2, 7, 1, 4, 6, 3, 5),
  Region = c(1, 0, 1, 0, 1, 0, 1, 1),
  check.names = FALSE
)

validation_probabilities <- stats::predict(
  fit,
  newdata = validation_patients,
  type = "prob"
)[, "Yes"]

validation_cases <- lapply(seq_len(nrow(validation_patients)), function(i) {
  patient <- as.list(validation_patients[i, , drop = FALSE])
  patient$Type <- as.character(patient$Type)
  list(
    patient = patient,
    expectedProbability = unname(validation_probabilities[i])
  )
})

jsonlite::write_json(
  validation_cases,
  path = file.path(output_directory, "tests", "model-validation-cases.json"),
  auto_unbox = TRUE,
  digits = 16,
  pretty = TRUE
)

cat(
  "Exported locked RF:",
  rf$ntree,
  "trees; training N =",
  nrow(training),
  "; mtry =",
  fit$bestTune$mtry,
  "\n"
)
