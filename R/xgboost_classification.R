library(terra)
library(sf)
library(dplyr)
library(caret)
library(fasterize)
library(xgboost)

# ============================================================
# XGBoost classification and cross-validation
# ============================================================
# This script:
# 1. loads a prepared raster feature stack,
# 2. rasterizes reference polygons,
# 3. joins predefined polygon-level folds,
# 4. performs 5-fold cross-validation using XGBoost,
# 5. exports evaluation metrics.
#
# Before running the script, update paths in the USER INPUT
# section below.
# ============================================================

# ------------------------------------------------------------
# 1. USER INPUT
# ------------------------------------------------------------

reference_polygons_path <- "path/to/ref_2024.gpkg"
feature_stack_path <- "path/to/dane_trening_2024.tif"
saved_folds_path <- "path/to/saved_folds.csv"
output_dir <- "path/to/output_directory"

nrounds <- 150
random_seed <- 42

dir.create(output_dir, showWarnings = FALSE, recursive = TRUE)

# ------------------------------------------------------------
# 2. HELPER FUNCTION
# ------------------------------------------------------------

run_xgb_cv <- function(feature_raster, reference_polygons_path, saved_folds_path, output_csv, nrounds = 150) {
  message("Starting XGBoost cross-validation...")

  polygons <- st_read(reference_polygons_path, quiet = TRUE) %>%
    dplyr::select(kod_gdos) %>%
    mutate(
      klasa = case_when(
        kod_gdos == "7110" ~ 7110L,
        kod_gdos == "7140" ~ 7140L,
        kod_gdos == "6520" ~ 6520L,
        kod_gdos == "91D0" ~ 9190L,
        kod_gdos == "9410" ~ 9410L,
        TRUE ~ NA_integer_
      ),
      id = row_number()
    ) %>%
    filter(!is.na(klasa))

  if (!st_crs(polygons) == crs(feature_raster)) {
    polygons <- st_transform(polygons, crs = crs(feature_raster))
  }

  polygons_sf <- st_as_sf(polygons)
  template_raster <- raster(feature_raster)

  fid_raster <- fasterize(polygons_sf, template_raster, field = "id", fun = "first")
  class_raster <- fasterize(polygons_sf, template_raster, field = "klasa", fun = "first")

  fid_raster_terra <- rast(fid_raster)
  class_raster_terra <- rast(class_raster)

  data_stack <- c(feature_raster, class_raster_terra, fid_raster_terra)
  names(data_stack)[nlyr(data_stack) - 1] <- "klasa"
  names(data_stack)[nlyr(data_stack)] <- "fid"

  training_df <- as.data.frame(data_stack, na.rm = TRUE)
  training_df$klasa <- as.factor(training_df$klasa)
  training_df$fid <- as.integer(training_df$fid)

  class_levels <- levels(training_df$klasa)
  class_map <- setNames(0:(length(class_levels) - 1), class_levels)
  training_df$klasa_num <- class_map[as.character(training_df$klasa)]

  saved_folds <- read.csv(saved_folds_path)
  training_df <- training_df %>%
    left_join(saved_folds, by = "fid")

  results <- list()
  metrics_list <- list()

  for (i in 1:5) {
    cat("\nFold", i, "\n")

    train_df <- training_df %>% filter(fold != i, !is.na(klasa_num))
    test_df <- training_df %>% filter(fold == i, !is.na(klasa_num))

    X_train <- as.matrix(train_df %>% select(-klasa, -klasa_num, -fid, -fold))
    y_train <- train_df$klasa_num

    X_test <- as.matrix(test_df %>% select(-klasa, -klasa_num, -fid, -fold))
    y_test <- test_df$klasa_num

    dtrain <- xgb.DMatrix(data = X_train, label = y_train, missing = NA)
    dtest <- xgb.DMatrix(data = X_test, label = y_test, missing = NA)

    params <- list(
      objective = "multi:softmax",
      num_class = length(class_levels),
      eval_metric = "mlogloss",
      max_depth = 6,
      eta = 0.08,
      subsample = 0.8,
      colsample_bytree = 0.9,
      min_child_weight = 3
    )

    set.seed(random_seed)
    xgb_model <- xgboost(
      params = params,
      data = dtrain,
      nrounds = nrounds,
      verbose = 0
    )

    preds <- predict(xgb_model, dtest)
    predicted_classes <- factor(class_levels[preds + 1], levels = class_levels)

    cm <- confusionMatrix(predicted_classes, test_df$klasa)
    results[[i]] <- cm

    producers_acc <- cm$byClass[, "Sensitivity"]
    users_acc <- cm$byClass[, "Pos Pred Value"]
    f1_score <- 2 * (producers_acc * users_acc) / (producers_acc + users_acc)

    fold_metrics <- data.frame(
      Fold = i,
      Klasa = rownames(cm$byClass),
      Producers_Accuracy = round(producers_acc, 4),
      Users_Accuracy = round(users_acc, 4),
      F1_Score = round(f1_score, 4),
      Overall_Accuracy = round(as.numeric(cm$overall["Accuracy"]), 4),
      Kappa = round(as.numeric(cm$overall["Kappa"]), 4)
    )

    metrics_list[[i]] <- fold_metrics
  }

  all_metrics_df <- do.call(rbind, metrics_list)
  write.csv(all_metrics_df, output_csv, row.names = FALSE)

  accuracies <- sapply(results, function(x) x$overall["Accuracy"])
  cat("\nMean cross-validation accuracy:", round(mean(accuracies), 4), "\n")
}

# ------------------------------------------------------------
# 3. LOAD FEATURE STACK
# ------------------------------------------------------------

data_raster <- rast(feature_stack_path)

# Feature subsets used in the comparison
data_s2 <- subset(data_raster, c(71:85))
data_s2_ndmi <- subset(data_raster, c(71:88))
data_s2_texture <- subset(data_raster, c(13:66, 71:88))
data_s1 <- subset(data_raster, c(67:70))
data_s1_texture <- subset(data_raster, c(1:12, 67:70))
data_s2_s1_ndmi <- subset(data_raster, c(67:88))
data_s2_ndmi_s1_texture <- subset(data_raster, c(1:12, 67:88))
data_texture <- subset(data_raster, c(1:66))
data_all <- data_raster

# ------------------------------------------------------------
# 4. RUN MODEL COMPARISON
# ------------------------------------------------------------

run_xgb_cv(
  feature_raster = data_s2,
  reference_polygons_path = reference_polygons_path,
  saved_folds_path = saved_folds_path,
  output_csv = file.path(output_dir, "data_s2_xgb.csv"),
  nrounds = nrounds
)

run_xgb_cv(
  feature_raster = data_s2_ndmi,
  reference_polygons_path = reference_polygons_path,
  saved_folds_path = saved_folds_path,
  output_csv = file.path(output_dir, "data_s2_ndmi_xgb.csv"),
  nrounds = nrounds
)

run_xgb_cv(
  feature_raster = data_s2_texture,
  reference_polygons_path = reference_polygons_path,
  saved_folds_path = saved_folds_path,
  output_csv = file.path(output_dir, "data_s2_texture_xgb.csv"),
  nrounds = nrounds
)

run_xgb_cv(
  feature_raster = data_s1,
  reference_polygons_path = reference_polygons_path,
  saved_folds_path = saved_folds_path,
  output_csv = file.path(output_dir, "data_s1_xgb.csv"),
  nrounds = nrounds
)

run_xgb_cv(
  feature_raster = data_s1_texture,
  reference_polygons_path = reference_polygons_path,
  saved_folds_path = saved_folds_path,
  output_csv = file.path(output_dir, "data_s1_texture_xgb.csv"),
  nrounds = nrounds
)

run_xgb_cv(
  feature_raster = data_s2_s1_ndmi,
  reference_polygons_path = reference_polygons_path,
  saved_folds_path = saved_folds_path,
  output_csv = file.path(output_dir, "data_s2_s1_ndmi_xgb.csv"),
  nrounds = nrounds
)

run_xgb_cv(
  feature_raster = data_s2_ndmi_s1_texture,
  reference_polygons_path = reference_polygons_path,
  saved_folds_path = saved_folds_path,
  output_csv = file.path(output_dir, "data_s2_ndmi_s1_texture_xgb.csv"),
  nrounds = nrounds
)

run_xgb_cv(
  feature_raster = data_all,
  reference_polygons_path = reference_polygons_path,
  saved_folds_path = saved_folds_path,
  output_csv = file.path(output_dir, "data_all_xgb.csv"),
  nrounds = nrounds
)

run_xgb_cv(
  feature_raster = data_texture,
  reference_polygons_path = reference_polygons_path,
  saved_folds_path = saved_folds_path,
  output_csv = file.path(output_dir, "data_texture_xgb.csv"),
  nrounds = nrounds
)
