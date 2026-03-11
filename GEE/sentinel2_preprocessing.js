// Sentinel-2 feature generation in Google Earth Engine
// This script:
// 1. loads Sentinel-2 SR data for a user-defined AOI,
// 2. applies cloud masking using Cloud Score+,
// 3. calculates spectral indices,
// 4. generates mean composites for selected months,
// 5. exports multiband feature stacks.
//
// Before running the script, update the USER INPUT section below.

// ------------------------------------------------------------
// 1. USER INPUT
// ------------------------------------------------------------

// Define your Area of Interest (AOI) here.
// Example:
// var geometry = ee.FeatureCollection("projects/your-project/assets/your_aoi");

// Year and months used in the final classification
var selectedYears = [2024];
var selectedMonths = [5, 7, 9];

// Cloud Score+ settings
var qaBand = "cs";
var clearThreshold = 0.70;

// Export settings
var exportFolder = "your_drive_folder";
var exportScale = 10;

// ------------------------------------------------------------
// 2. LOAD SENTINEL-2 AND CLOUD SCORE+ DATA
// ------------------------------------------------------------

var s2 = ee.ImageCollection("COPERNICUS/S2_SR");
var csPlus = ee.ImageCollection("GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED");

// ------------------------------------------------------------
// 3. CALCULATE SPECTRAL INDICES
// ------------------------------------------------------------

function addSpectralIndices(image) {
  var nir = image.select("B8");
  var red = image.select("B4");
  var green = image.select("B3");
  var swir1 = image.select("B11");
  var swir2 = image.select("B12");

  var ndvi = nir.subtract(red).divide(nir.add(red)).rename("NDVI");
  var ndmi = nir.subtract(swir1).divide(nir.add(swir1)).rename("NDMI");
  var ndwi = green.subtract(nir).divide(green.add(nir)).rename("NDWI");
  var ndii = nir.subtract(swir2).divide(nir.add(swir2)).rename("NDII");

  return image.addBands([ndvi, ndmi, ndwi, ndii]);
}

// ------------------------------------------------------------
// 4. BUILD CLOUD-MASKED SENTINEL-2 COLLECTION
// ------------------------------------------------------------

var minYear = Math.min.apply(null, selectedYears);
var maxYear = Math.max.apply(null, selectedYears);

var sentinel2Prepared = s2
  .filterBounds(geometry)
  .filter(ee.Filter.calendarRange(minYear, maxYear, "year"))
  .linkCollection(csPlus, [qaBand])
  .map(function(image) {
    return image.updateMask(image.select(qaBand).gte(clearThreshold));
  })
  .map(addSpectralIndices);

// ------------------------------------------------------------
// 5. CREATE MONTHLY MEAN IMAGES
// ------------------------------------------------------------

function monthlyMeanImage(year, month) {
  var startDate = ee.Date.fromYMD(year, month, 1);
  var endDate = startDate.advance(1, "month");

  var monthlyCollection = sentinel2Prepared
    .filterDate(startDate, endDate)
    .select(["NDVI", "NDMI", "NDWI", "NDII", "B2", "B3", "B4", "B8"]);

  var monthLabel = (month < 10 ? "0" + month : String(month));

  var outputBandNames = [
    "NDVI_" + year + "_" + monthLabel,
    "NDMI_" + year + "_" + monthLabel,
    "NDWI_" + year + "_" + monthLabel,
    "NDII_" + year + "_" + monthLabel,
    "B2_" + year + "_" + monthLabel,
    "B3_" + year + "_" + monthLabel,
    "B4_" + year + "_" + monthLabel,
    "B8_" + year + "_" + monthLabel
  ];

  // Return an empty image if no valid observations are available for a given month
  var emptyImage = ee.Image.constant([0, 0, 0, 0, 0, 0, 0, 0])
    .rename(outputBandNames)
    .clip(geometry)
    .toFloat();

  var meanImage = ee.Algorithms.If(
    monthlyCollection.size().eq(0),
    emptyImage,
    monthlyCollection.mean().rename(outputBandNames).toFloat()
  );

  return ee.Image(meanImage);
}

// ------------------------------------------------------------
// 6. BUILD MULTIBAND FEATURE STACKS
// ------------------------------------------------------------

var ndviImages = [];
var ndmiImages = [];
var ndwiImages = [];
var ndiiImages = [];
var b2Images = [];
var b3Images = [];
var b4Images = [];
var b8Images = [];

for (var y = 0; y < selectedYears.length; y++) {
  for (var m = 0; m < selectedMonths.length; m++) {
    var year = selectedYears[y];
    var month = selectedMonths[m];
    var monthLabel = (month < 10 ? "0" + month : String(month));

    var meanImage = monthlyMeanImage(year, month);

    ndviImages.push(meanImage.select([0]).rename("NDVI_" + year + "_" + monthLabel));
    ndmiImages.push(meanImage.select([1]).rename("NDMI_" + year + "_" + monthLabel));
    ndwiImages.push(meanImage.select([2]).rename("NDWI_" + year + "_" + monthLabel));
    ndiiImages.push(meanImage.select([3]).rename("NDII_" + year + "_" + monthLabel));
    b2Images.push(meanImage.select([4]).rename("B2_" + year + "_" + monthLabel));
    b3Images.push(meanImage.select([5]).rename("B3_" + year + "_" + monthLabel));
    b4Images.push(meanImage.select([6]).rename("B4_" + year + "_" + monthLabel));
    b8Images.push(meanImage.select([7]).rename("B8_" + year + "_" + monthLabel));
  }
}

var ndviImage = ee.ImageCollection(ndviImages).toBands().toFloat();
var ndmiImage = ee.ImageCollection(ndmiImages).toBands().toFloat();
var ndwiImage = ee.ImageCollection(ndwiImages).toBands().toFloat();
var ndiiImage = ee.ImageCollection(ndiiImages).toBands().toFloat();
var b2Image = ee.ImageCollection(b2Images).toBands().toFloat();
var b3Image = ee.ImageCollection(b3Images).toBands().toFloat();
var b4Image = ee.ImageCollection(b4Images).toBands().toFloat();
var b8Image = ee.ImageCollection(b8Images).toBands().toFloat();

// Remove collection-generated prefixes
function cleanBandNames(image) {
  var oldNames = image.bandNames();
  var newNames = oldNames.map(function(name) {
    return ee.String(name).split("_").slice(1).join("_");
  });
  return image.rename(newNames);
}

ndviImage = cleanBandNames(ndviImage);
ndmiImage = cleanBandNames(ndmiImage);
ndwiImage = cleanBandNames(ndwiImage);
ndiiImage = cleanBandNames(ndiiImage);
b2Image = cleanBandNames(b2Image);
b3Image = cleanBandNames(b3Image);
b4Image = cleanBandNames(b4Image);
b8Image = cleanBandNames(b8Image);

// ------------------------------------------------------------
// 7. EXPORT FEATURE STACKS
// ------------------------------------------------------------

Export.image.toDrive({
  image: ndviImage.clip(geometry),
  description: "NDVI_selected_months_stack",
  folder: exportFolder,
  scale: exportScale,
  region: geometry,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: ndmiImage.clip(geometry),
  description: "NDMI_selected_months_stack",
  folder: exportFolder,
  scale: exportScale,
  region: geometry,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: ndwiImage.clip(geometry),
  description: "NDWI_selected_months_stack",
  folder: exportFolder,
  scale: exportScale,
  region: geometry,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: ndiiImage.clip(geometry),
  description: "NDII_selected_months_stack",
  folder: exportFolder,
  scale: exportScale,
  region: geometry,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: b2Image.clip(geometry),
  description: "B2_selected_months_stack",
  folder: exportFolder,
  scale: exportScale,
  region: geometry,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: b3Image.clip(geometry),
  description: "B3_selected_months_stack",
  folder: exportFolder,
  scale: exportScale,
  region: geometry,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: b4Image.clip(geometry),
  description: "B4_selected_months_stack",
  folder: exportFolder,
  scale: exportScale,
  region: geometry,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: b8Image.clip(geometry),
  description: "B8_selected_months_stack",
  folder: exportFolder,
  scale: exportScale,
  region: geometry,
  maxPixels: 1e13
});
