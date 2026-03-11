// Sentinel-1 quarterly feature generation in Google Earth Engine
// This script:
// 1. loads Sentinel-1 GRD data for a user-defined AOI,
// 2. calculates radar indices (RVI, NDPI, CPR),
// 3. generates quarterly mean composites,
// 4. exports multiband quarterly stacks.
//
// Before running the script, update the USER INPUT section below.

// ------------------------------------------------------------
// 1. USER INPUT
// ------------------------------------------------------------

// Define your Area of Interest (AOI) here.
// Example:
// var geometry = ee.FeatureCollection("projects/your-project/assets/your_aoi");

// Years used in the final classification
var selectedYears = [2024];

// Quarter definitions used in the project
var quarterDefinitions = [
  {label: "Q1", months: [1, 2, 3]},
  {label: "Q2", months: [4, 5, 6]},
  {label: "Q3", months: [7, 8, 9]},
  {label: "Q4", months: [10, 11, 12]}
];

// Export settings
var exportFolder = "your_drive_folder";
var exportScale = 10;

// ------------------------------------------------------------
// 2. LOAD SENTINEL-1 DATA
// ------------------------------------------------------------

var minYear = Math.min.apply(null, selectedYears);
var maxYear = Math.max.apply(null, selectedYears);

var sentinel1 = ee.ImageCollection("COPERNICUS/S1_GRD")
  .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
  .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
  .filter(ee.Filter.eq("instrumentMode", "IW"))
  .filterBounds(geometry)
  .filter(ee.Filter.calendarRange(minYear, maxYear, "year"));

// ------------------------------------------------------------
// 3. CALCULATE RADAR INDICES
// ------------------------------------------------------------

function addRadarIndices(image) {
  var vv = image.select("VV");
  var vh = image.select("VH");

  // Convert backscatter from dB to linear scale
  var vvLinear = ee.Image(10).pow(vv.divide(10));
  var vhLinear = ee.Image(10).pow(vh.divide(10));

  var rvi = vhLinear.multiply(4.0)
    .divide(vvLinear.add(vhLinear))
    .rename("RVI");

  var ndpi = vvLinear.subtract(vhLinear)
    .divide(vvLinear.add(vhLinear))
    .rename("NDPI");

  var cpr = vhLinear.divide(vvLinear)
    .rename("CPR");

  return image.addBands([rvi, ndpi, cpr]);
}

var sentinel1WithIndices = sentinel1.map(addRadarIndices);

// ------------------------------------------------------------
// 4. CREATE QUARTERLY MEAN IMAGES
// ------------------------------------------------------------

function quarterlyMeanImage(year, quarterLabel, monthsList) {
  var quarterlyCollection = ee.ImageCollection(
    monthsList.map(function(month) {
      var startDate = ee.Date.fromYMD(year, month, 1);
      var endDate = startDate.advance(1, "month");

      return sentinel1WithIndices
        .filterDate(startDate, endDate)
        .select(["RVI", "NDPI", "CPR"])
        .mean();
    })
  );

  var outputBandNames = [
    "RVI_" + year + "_" + quarterLabel,
    "NDPI_" + year + "_" + quarterLabel,
    "CPR_" + year + "_" + quarterLabel
  ];

  // Return an empty image if no valid observations are available
  var emptyImage = ee.Image.constant([0, 0, 0])
    .rename(outputBandNames)
    .clip(geometry)
    .toFloat();

  var meanImage = ee.Algorithms.If(
    quarterlyCollection.size().eq(0),
    emptyImage,
    quarterlyCollection.mean().rename(outputBandNames).toFloat()
  );

  return ee.Image(meanImage);
}

// ------------------------------------------------------------
// 5. BUILD MULTIBAND QUARTERLY STACKS
// ------------------------------------------------------------

var rviImages = [];
var ndpiImages = [];
var cprImages = [];

for (var y = 0; y < selectedYears.length; y++) {
  var year = selectedYears[y];

  for (var q = 0; q < quarterDefinitions.length; q++) {
    var quarterLabel = quarterDefinitions[q].label;
    var monthsList = quarterDefinitions[q].months;

    var meanImage = quarterlyMeanImage(year, quarterLabel, monthsList);

    rviImages.push(
      meanImage.select([0]).rename("RVI_" + year + "_" + quarterLabel)
    );

    ndpiImages.push(
      meanImage.select([1]).rename("NDPI_" + year + "_" + quarterLabel)
    );

    cprImages.push(
      meanImage.select([2]).rename("CPR_" + year + "_" + quarterLabel)
    );
  }
}

var rviImage = ee.ImageCollection(rviImages).toBands().toFloat();
var ndpiImage = ee.ImageCollection(ndpiImages).toBands().toFloat();
var cprImage = ee.ImageCollection(cprImages).toBands().toFloat();

// Remove collection-generated prefixes
function cleanBandNames(image) {
  var oldNames = image.bandNames();
  var newNames = oldNames.map(function(name) {
    return ee.String(name).split("_").slice(1).join("_");
  });
  return image.rename(newNames);
}

rviImage = cleanBandNames(rviImage);
ndpiImage = cleanBandNames(ndpiImage);
cprImage = cleanBandNames(cprImage);

// ------------------------------------------------------------
// 6. EXPORT QUARTERLY STACKS
// ------------------------------------------------------------

Export.image.toDrive({
  image: rviImage.clip(geometry),
  description: "RVI_quarterly_stack",
  folder: exportFolder,
  scale: exportScale,
  region: geometry,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: ndpiImage.clip(geometry),
  description: "NDPI_quarterly_stack",
  folder: exportFolder,
  scale: exportScale,
  region: geometry,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: cprImage.clip(geometry),
  description: "CPR_quarterly_stack",
  folder: exportFolder,
  scale: exportScale,
  region: geometry,
  maxPixels: 1e13
});
