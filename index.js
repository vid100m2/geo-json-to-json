const fs = require("fs");
const turf = require("@turf/turf");
const { encode } = require("@googlemaps/polyline-codec");

const index = require("./100m2_index.json");

const cities = index.location_city;

// Input GeoJSON file
const inputFile = "obcine.geojson";

// Read and parse GeoJSON file
fs.readFile(inputFile, "utf8", (err, data) => {
  if (err) {
    console.error("Error reading file:", err);
    return;
  }

  try {
    const geojson = JSON.parse(data);
    const simplifiedFeatures = geojson.features.map((feature) => {
      if (
        feature.geometry &&
        (feature.geometry.type === "Polygon" ||
          feature.geometry.type === "MultiPolygon")
      ) {
        // Simplify the geometry using Turf.js with a lower tolerance for better accuracy
        const simplified = turf.simplify(feature, {
          tolerance: 0.001,
          highQuality: true,
        });
        return { ...feature, geometry: simplified.geometry };
      }
      return feature;
    });

    const output = simplifiedFeatures
      .map((feature) => {
        let name = feature.properties ? feature.properties.name : undefined;

        if (name && name.includes(" /")) name = name.split(" /")[0]; //Dvojezična imena občin
        if (name && name.includes("-")) name = name.replace(/-/g, " - "); //Handle Rače-Fram etc

        //Manual Exceptions
        if (name === "Kanal") name = "Kanal ob Soči";

        let encodedPaths = [];
        let center = { lat: null, lng: null };

        // Calculate the centroid of the feature
        const centroid = turf.centroid(feature);
        if (centroid && centroid.geometry && centroid.geometry.coordinates) {
          center.lat = centroid.geometry.coordinates[1];
          center.lng = centroid.geometry.coordinates[0];
        }

        if (feature.geometry.type === "Polygon") {
          const coordinates = feature.geometry.coordinates[0].map((coord) => [
            coord[1],
            coord[0],
          ]);
          const encodedPath = encode(coordinates, 5); // Adjust the precision if needed
          encodedPaths.push(encodedPath);
        } else if (feature.geometry.type === "MultiPolygon") {
          feature.geometry.coordinates.forEach((polygon) => {
            const coordinates = polygon[0].map((coord) => [coord[1], coord[0]]);
            const encodedPath = encode(coordinates, 5); // Adjust the precision if needed
            encodedPaths.push(encodedPath);
          });
        }

        let foundCity;
        if (name === "Ljubljana") {
          foundCity = cities.find((city) => city.id === "143");
        } else {
          foundCity = cities.find((city) => {
            if (city.text && feature.properties && name)
              return city.text.normalize("NFC") === name.normalize("NFC");
            return false;
          });
        }

        return {
          name,
          encodedPaths,
          center,
          id: foundCity ? foundCity.id : "",
        };
      })
      .filter((feature) => feature.encodedPaths.length > 0);

    // Write output to a file
    fs.writeFile(
      "output.json",
      JSON.stringify(output, null, 2),
      "utf8",
      (err) => {
        if (err) {
          console.error("Error writing file:", err);
        } else {
          console.log("Output written to output.json");
        }
      }
    );
  } catch (parseErr) {
    console.error("Error parsing JSON:", parseErr);
  }
});
