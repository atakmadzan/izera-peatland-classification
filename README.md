# Izera Peatland Classification using Sentinel-1, Sentinel-2 and Machine Learning

This repository presents a machine learning workflow for peatland classification in the **Izera Mountains** using multi-source satellite data and texture features.

The project integrates:

- **Sentinel-2 optical imagery**
- **Sentinel-1 radar imagery**
- **GLCM texture features**
- **Random Forest**
- **XGBoost**

The aim of the study was to evaluate how different combinations of satellite data and features influence classification accuracy of peatland habitats.

---

# Background

Peatlands are important ecosystems with a key role in **carbon storage, biodiversity conservation and hydrological regulation**. Accurate mapping of peatland habitats is therefore important for environmental monitoring and conservation planning.

Satellite remote sensing enables large-scale habitat classification using both **optical** and **radar** imagery. Optical sensors provide spectral information related to vegetation condition, while radar data are sensitive to surface structure and moisture.

Combining these data sources together with **texture features** can improve classification performance in heterogeneous environments.

---

# Study Objective

The goal of this project was to classify peatland habitats in the **Izera region** and compare the performance of different feature sets and machine learning models.

The following machine learning algorithms were tested:

- **Random Forest**
- **XGBoost**

Different combinations of input features were evaluated, including:

- Sentinel-2 spectral data
- Sentinel-2 vegetation indices
- Sentinel-1 radar data
- texture features derived from satellite imagery
- combined Sentinel-1 and Sentinel-2 datasets

The performance of the models was evaluated using **accuracy and Cohen’s kappa statistics**.

---

## Repository Structure

- **gee/** – Sentinel-1 and Sentinel-2 preprocessing and export of satellite datasets from Google Earth Engine  
- **R/** – GLCM texture feature generation, preparation of stratified training data and machine learning classification using Random Forest and XGBoost  
- **figures/** – comparison of model performance and example peatland classification results

---

# Workflow

The project workflow consists of several processing stages.

### 1. Satellite data preparation (Google Earth Engine)

Sentinel-1 and Sentinel-2 datasets are prepared using **Google Earth Engine** scripts.  
Processing includes filtering of imagery, cloud masking, and export of prepared datasets.

### 2. Feature generation

Texture features are generated in **R** using the **GLCM (Gray Level Co-occurrence Matrix)** method.

### 3. Training data preparation

Training data are prepared using stratified sampling to ensure balanced representation of classes.

### 4. Machine learning classification

Two classification algorithms are tested:

- **Random Forest**
- **XGBoost**

Multiple feature combinations are evaluated to determine their influence on classification performance.

### 5. Model comparison

The classification results are compared using accuracy metrics and confusion matrix statistics.

### 6. Final classification

The best performing model is used to generate the final peatland classification map.

---

# Example Results

Results include:

- comparison of classification accuracy for different feature sets and algorithms
- final peatland classification map for the Izera Mountains

The results will be presented in the **figures** directory as:

- a table comparing model performance
- a map showing the best classification result.

---

# Technologies Used

- **Google Earth Engine**
- **R**
- **Random Forest**
- **XGBoost**
- **terra**
- **GLCM texture analysis**
- **Sentinel-1 and Sentinel-2 satellite data**

---

# Author

This project was developed as part of a research project carried out within the **KNGiT UW** (Scientific Association of Geoinformatics and Remote Sensing at the University of Warsaw).
