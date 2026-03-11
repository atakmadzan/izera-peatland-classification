library(raster)
library(terra)
library(sf)
library(glcm)
library(caret)
library(dplyr)
library(fasterize)

# ============================================================
# Training data preparation for peatland classification
# ============================================================
# This script:
# 1. loads Sentinel-1 and Sentinel-2 raster stacks,
# 2. computes GLCM texture features,
# 3. rasterizes reference polygons,
# 4. creates a pixel-based training table,
# 5. assigns stratified folds based on dominant polygon class.
#
# Before running the script, update paths in the USER INPUT
# section below.
# ============================================================

# ------------------------------------------------------------
# 1. USER INPUT
# ------------------------------------------------------------

reference_polygons_path <- "path/to/reference_polygons.gpkg"
sentinel2_stack_path <- "path/to/s2_2024_stack.tif"
sentinel1_stack_path <- "path/to/s1_2024_stack.tif"

output_training_table_path <- "path/to/output/training_data_with_folds.csv"
output_fold_summary_path <- "path/to/output/fold_class_summary.csv"

# GLCM settings
glcm_statistics <- c("contrast", "entropy", "homogeneity")
glcm_window <- c(5, 5)
glcm_shift <- c(1, 1)

# Number of folds
n_folds <- 5
random_seed <- 42

# ------------------------------------------------------------
# 2. LOAD INPUT DATA
# ------------------------------------------------------------

polygons <- st_read(reference_polygons_path, quiet = TRUE)

s2_r <- stack(sentinel2_stack_path)
s1_r <- stack(sentinel1_stack_path)

# Reproject Sentinel-1 to Sentinel-2 grid
s1_r <- projectRaster(s1_r, s2_r, method = "bilinear")

# Rename layers
names(s1_r) <- paste0("S1_", names(s1_r))
names(s2_r) <- paste0("S2_", names(s2_r))

combined_r <- stack(s1_r, s2_r)

# ------------------------------------------------------------
# 3. PREPARE REFERENCE POLYGONS
# ------------------------------------------------------------

polygons <- polygons %>%
  dplyr::select(kod_gdos) %>%
  mutate(
    klasa = as.integer(recode(
      kod_gdos,
      "7110" = 7110,
      "7140" = 7140,
      "6520" = 6520,
      "91D0" = 9190,
      "9410" = 9410
    )),
    id = row_number()
  )

# Reproject polygons if needed
if (!st_crs(polygons) == crs(s2_r)) {
  polygons <- st_transform(polygons, crs = crs(s2_r))
}

# ------------------------------------------------------------
# 4. COMPUTE GLCM TEXTURE FEATURES
# ------------------------------------------------------------

input_layers <- names(combined_r)

glcm_list <- lapply(input_layers, function(layer_name) {
  message("Computing GLCM for: ", layer_name)

  glcm(
    combined_r[[layer_name]],
    window = glcm_window,
    shift = glcm_shift,
    statistics = glcm_statistics
  )
})

glcm_stack <- stack(lapply(glcm_list, stack))
names(glcm_stack) <- unlist(
  lapply(input_layers, function(layer_name) {
    paste0(layer_name, "_", glcm_statistics)
  })
)

# Convert to terra and append original Sentinel layers
feature_stack <- rast(glcm_stack)
feature_stack <- c(feature_stack, rast(s1_r), rast(s2_r))

# ------------------------------------------------------------
# 5. RASTERIZE REFERENCE POLYGONS
# ------------------------------------------------------------

polygons_sf <- st_as_sf(polygons)
template_raster <- raster(feature_stack)

fid_raster <- fasterize(polygons_sf, template_raster, field = "id", fun = "first")
class_raster <- fasterize(polygons_sf, template_raster, field = "klasa", fun = "first")

fid_raster_terra <- rast(fid_raster)
class_raster_terra <- rast(class_raster)

data_stack <- c(feature_stack, class_raster_terra, fid_raster_terra)
names(data_stack)[nlyr(data_stack) - 1] <- "klasa"
names(data_stack)[nlyr(data_stack)] <- "fid"

# ------------------------------------------------------------
# 6. CREATE PIXEL-BASED TRAINING TABLE
# ------------------------------------------------------------

training_df <- as.data.frame(data_stack, na.rm = TRUE)
training_df <- training_df[complete.cases(training_df), ]

training_df$klasa <- as.factor(training_df$klasa)
training_df$fid <- as.integer(training_df$fid)

# ------------------------------------------------------------
# 7. ASSIGN STRATIFIED FOLDS BY POLYGON
# ------------------------------------------------------------
# Folds are assigned at polygon level to avoid mixing pixels
# from the same polygon between training and validation subsets.

dominant_classes <- training_df %>%
  group_by(fid) %>%
  count(klasa) %>%
  slice_max(n, n = 1, with_ties = FALSE) %>%
  ungroup()

set.seed(random_seed)
fid_folds <- createFolds(dominant_classes$klasa, k = n_folds, list = FALSE)

dominant_classes$fold <- fid_folds

training_df <- training_df %>%
  left_join(dominant_classes %>% select(fid, fold), by = "fid")

# ------------------------------------------------------------
# 8. SAVE OUTPUTS
# ------------------------------------------------------------

fold_summary <- as.data.frame(table(training_df$fold, training_df$klasa))
colnames(fold_summary) <- c("fold", "class", "count")

write.csv(training_df, output_training_table_path, row.names = FALSE)
write.csv(fold_summary, output_fold_summary_path, row.names = FALSE)

message("Training data preparation finished.")
message("Output table saved to: ", output_training_table_path)
message("Fold summary saved to: ", output_fold_summary_path)
