// Sentinel-1 monthly feature generation in Google Earth Engine
// This script:
// 1. loads Sentinel-1 GRD data for a user-defined AOI,
// 2. calculates radar indices (RVI, NDPI, CPR),
// 3. generates monthly mean composites,
// 4. exports multiband monthly stacks.
//
// Before running the script, update the USER INPUT section below.

// ------------------------------------------------------------
// 1. USER INPUT
// ------------------------------------------------------------

// Define your Area of Interest (AOI) here.
// Example:
// var geometry = ee.FeatureCollection("projects/your-project/assets/your_aoi");

// Year range
var startYear = 2018;
var endYear = 2024;

// Export settings
var exportFolder = "your_drive_folder";
var exportScale = 10;

// ------------------------------------------------------------
// 2. LOAD SENTINEL-1 DATA
// ------------------------------------------------------------

var sentinel1 = ee.ImageCollection("COPERNICUS/S1_GRD")
  .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
  .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
  .filter(ee.Filter.eq("instrumentMode", "IW"))
  .filterBounds(geometry)
  .filter(ee.Filter.calendarRange(startYear, endYear, "year"));

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
// 4. CREATE MONTHLY MEAN IMAGES
// ------------------------------------------------------------

function monthlyMeanImage(year, month) {
  year = ee.Number(year);
  month = ee.Number(month);

  var startDate = ee.Date.fromYMD(year, month, 1);
  var endDate = startDate.advance(1, "month");

  var monthlyCollection = sentinel1WithIndices
    .filterDate(startDate, endDate)
    .select(["RVI", "NDPI", "CPR"]);

  var monthString = month.format("%02d");
  var yearString = year.format("%d");

  var meanImage = monthlyCollection.mean().rename([
    ee.String("RVI_").cat(yearString).cat("_").cat(monthString),
    ee.String("NDPI_").cat(yearString).cat("_").cat(monthString),
    ee.String("CPR_").cat(yearString).cat("_").cat(monthString)
  ]);

  return meanImage;
}

// ------------------------------------------------------------
// 5. BUILD MULTIBAND MONTHLY STACKS
// ------------------------------------------------------------

var rviImages = [];
var ndpiImages = [];
var cprImages = [];

for (var year = startYear; year <= endYear; year++) {
  for (var month = 1; month <= 12; month++) {
    var meanImage = monthlyMeanImage(year, month);

    var monthLabel = (month < 10 ? "0" + month : String(month));

    rviImages.push(
      meanImage
        .select([0])
        .rename("RVI_" + year + "_" + monthLabel)
    );

    ndpiImages.push(
      meanImage
        .select([1])
        .rename("NDPI_" + year + "_" + monthLabel)
    );

    cprImages.push(
      meanImage
        .select([2])
        .rename("CPR_" + year + "_" + monthLabel)
    );
  }
}

var rviImage = ee.ImageCollection(rviImages).toBands();
var ndpiImage = ee.ImageCollection(ndpiImages).toBands();
var cprImage = ee.ImageCollection(cprImages).toBands();

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
// 6. EXPORT MONTHLY STACKS
// ------------------------------------------------------------

// Example export for all three radar indices.
// The exported rasters contain monthly bands for the selected time range.

Export.image.toDrive({
  image: rviImage.clip(geometry),
  description: "RVI_monthly_stack",
  folder: exportFolder,
  scale: exportScale,
  region: geometry,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: ndpiImage.clip(geometry),
  description: "NDPI_monthly_stack",
  folder: exportFolder,
  scale: exportScale,
  region: geometry,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: cprImage.clip(geometry),
  description: "CPR_monthly_stack",
  folder: exportFolder,
  scale: exportScale,
  region: geometry,
  maxPixels: 1e13
});
