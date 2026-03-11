// Dane Sentinel-1
var sentinel1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filterBounds(geometry) // Zamień geometry na interesujący Cię obszar
  .filter(ee.Filter.calendarRange(2018, 2024, 'year'));

// Funkcja do obliczania wskaźników RVI, NDPI i CPR
function calculateIndices(image) {
  var vv = image.select('VV');
  var vh = image.select('VH');

  // Konwersja wartości backscatter z dB na skalę liniową
  var vv_linear = ee.Image(10).pow(vv.divide(10));
  var vh_linear = ee.Image(10).pow(vh.divide(10));

  // Obliczenie wskaźników
  var rvi = vh_linear.multiply(4.0).divide(vv_linear.add(vh_linear)).rename('RVI');
  var ndpi = vv_linear.subtract(vh_linear).divide(vv_linear.add(vh_linear)).rename('NDPI');
  var cpr = vh_linear.divide(vv_linear).rename('CPR');

  return image.addBands([rvi, ndpi, cpr]);
}

// Dodawanie wskaźników do obrazów Sentinel-1
var sentinel1WithIndices = sentinel1.map(calculateIndices);

// Funkcja do obliczania miesięcznych średnich wskaźników
function monthlyMeanImage(year, month) {
  var startDate = ee.Date.fromYMD(year, month, 1);
  var endDate = startDate.advance(1, 'month');

  var monthlyCollection = sentinel1WithIndices
    .filterDate(startDate, endDate)
    .select(['RVI', 'NDPI', 'CPR']);

  var meanImage = monthlyCollection.mean()
    .rename(['RVI_' + year + '_' + month, 'NDPI_' + year + '_' + month, 'CPR_' + year + '_' + month]);

  return meanImage;
}

// Generowanie rastrów miesięcznych dla każdego wskaźnika
var years = ee.List.sequence(2018, 2024);
var months = ee.List.sequence(1, 12);

var allRviBands = ee.ImageCollection([]);
var allNdpiBands = ee.ImageCollection([]);
var allCprBands = ee.ImageCollection([]);

years.map(function(y) {
  months.map(function(m) {
    var meanImage = monthlyMeanImage(ee.Number(y), ee.Number(m));
    
    // Dodanie do odpowiednich kolekcji
    allRviBands = allRviBands.merge(ee.ImageCollection(meanImage.select(0)));
    allNdpiBands = allNdpiBands.merge(ee.ImageCollection(meanImage.select(1)));
    allCprBands = allCprBands.merge(ee.ImageCollection(meanImage.select(2)));
    
    return null; // Zwracamy wartość, żeby spełnić wymagania metody .map()
  });
  return null; // Zwracamy wartość, żeby spełnić wymagania metody .map()
});


// Generowanie rastrów miesięcznych dla każdego wskaźnika
var rviImages = [];
var ndpiImages = [];
var cprImages = [];

// Iteracja po latach i miesiącach
for (var year = 2018; year <= 2024; year++) {
  for (var month = 1; month <= 12; month++) {
    var meanImage = monthlyMeanImage(year, month);

    // Tworzenie nazw kanałów
    var rviBandName = 'RVI_' + year + '_' + (month < 10 ? '0' + month : month);
    var ndpiBandName = 'NDPI_' + year + '_' + (month < 10 ? '0' + month : month);
    var cprBandName = 'CPR_' + year + '_' + (month < 10 ? '0' + month : month);

    // Dodawanie warstw do odpowiednich list
    rviImages.push(meanImage.select('RVI_' + year + '_' + month).rename(rviBandName));
    ndpiImages.push(meanImage.select('NDPI_' + year + '_' + month).rename(ndpiBandName));
    cprImages.push(meanImage.select('CPR_' + year + '_' + month).rename(cprBandName));
  }
}

// Tworzenie obrazów wielokanałowych
var rviImage = ee.ImageCollection(rviImages).toBands();
var ndpiImage = ee.ImageCollection(ndpiImages).toBands();
var cprImage = ee.ImageCollection(cprImages).toBands();

// Eksport wynikowych obrazów wielokanałowych
Export.image.toDrive({
  image: rviImage.clip(geometry),
  description: 'RVI_Monthly_Averages',
  folder: 'izera',
  scale: 10,
  region: geometry,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: ndpiImage.clip(geometry),
  description: 'NDPI_Monthly_Averages',
  folder: 'izera',
  scale: 10,
  region: geometry,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: cprImage.clip(geometry),
  description: 'CPR_Monthly_Averages',
  folder: 'izera',
  scale: 10,
  region: geometry,
  maxPixels: 1e13
});
