'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, LayersControl, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import useStore from '@/lib/store';
import proj4 from 'proj4';

// Fix for default Leaflet icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Define common projections
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
proj4.defs("EPSG:25833", "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
proj4.defs("EPSG:32632", "+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs");
proj4.defs("EPSG:32633", "+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs");
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

// --- Styling Functions ---

const getColorByFCode = (fcode) => {
  if (!fcode) return '#808080'; // Default gray for unknown

  // Norwegian infrastructure color system
  const colorMap = {
    // Water infrastructure - BLUE shades
    VL: '#0066cc', // Vannledninger (Water lines)
    VF: '#0080ff', // Vannforsyning

    // Wastewater - GREEN shades
    SP: '#228B22', // Spillvannsledning (Wastewater lines)
    SPP: '#32CD32', // Spillvann pumpe

    // Surface water - BLACK/DARK shades
    OV: '#000000', // Overvannsledning (Surface water lines)
    OVP: '#333333', // Overvann pumpe

    // Drainage - BROWN shades
    DR: '#8B4513', // Drenseledning (Drainage lines)
    DRK: '#A0522D', // Drenering kum

    // Manholes/Infrastructure points - RED shades
    KUM: '#cc3300', // Kummer (Manholes)
    KUM_SP: '#dc143c', // Spillvann kum
    KUM_OV: '#b22222', // Overvann kum
    KUM_VL: '#cd5c5c', // Vann kum

    // Gas - YELLOW shades
    GAS: '#ffd700', // Gass ledninger
    GASL: '#ffff00', // Gass lavtrykk

    // Electric/Telecom - ORANGE shades
    EL: '#ff6600', // Elektrisk
    TELE: '#ff8c00', // Telekommunikasjon

    // District heating - MAGENTA
    FJERNVARME: '#ff00ff',

    // Other/Unknown - PURPLE (default)
    ANNET: '#800080',
  };

  // Try exact match first
  if (colorMap[fcode]) {
    return colorMap[fcode];
  }

  // Try partial matches for complex codes
  if (fcode.includes('VL') || fcode.includes('VANN')) return '#0066cc';
  if (fcode.includes('SP') || fcode.includes('SPILLVANN')) return '#228B22';
  if (fcode.includes('OV') || fcode.includes('OVERVANN')) return '#000000';
  if (fcode.includes('DR') || fcode.includes('DREN')) return '#8B4513';
  if (fcode.includes('KUM')) return '#cc3300';
  if (fcode.includes('GAS')) return '#ffd700';
  if (fcode.includes('EL') || fcode.includes('ELEKTR')) return '#ff6600';
  if (fcode.includes('TELE') || fcode.includes('TEL')) return '#ff8c00';
  if (fcode.includes('FJERN')) return '#ff00ff';

  // Everything else - purple
  return '#800080';
};

const getLineWeight = (properties) => {
  // Common dimension field names in Norwegian infrastructure data
  const dimensionFields = [
    'Dimensjon', 'DIMENSJON', 'DIMENSION', 'DIM', 'DIAMETER',
    'BREDDE', 'WIDTH', 'ROER_DIM', 'NOMINAL_DIM', 'SIZE', 'DN'
  ];

  let dimension = null;

  // Try to find dimension value from any of the common field names
  for (const field of dimensionFields) {
    if (properties[field] !== undefined && properties[field] !== null && properties[field] !== '') {
      const value = parseFloat(String(properties[field]).replace(/[^\d.]/g, ''));
      if (!isNaN(value) && value > 0) {
        dimension = value;
        break;
      }
    }
  }

  if (dimension === null) return 3; // Default weight

  // Scale dimension to line weight
  if (dimension <= 50) return 1; // Very thin pipes
  if (dimension <= 100) return 2; // Small pipes
  if (dimension <= 200) return 3; // Medium pipes
  if (dimension <= 300) return 4; // Large pipes
  if (dimension <= 500) return 6; // Very large pipes
  return 8; // Huge pipes
};

// --- Components ---

function BoundsController({ geoJsonData }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !geoJsonData) return;

    try {
      const geoJsonLayer = L.geoJSON(geoJsonData);
      const bounds = geoJsonLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    } catch (e) {
      console.warn("Could not fit bounds", e);
    }
  }, [map, geoJsonData]);

  return null;
}

function ZoomHandler({ onZoomChange }) {
  const map = useMapEvents({
    zoomend: () => {
      onZoomChange(map.getZoom());
    },
  });
  return null;
}

export default function MapInner({ onZoomChange }) {
  const data = useStore((state) => state.data);

  const geoJsonData = useMemo(() => {
    if (!data) return null;

    const { points, lines, header } = data;
    const features = [];

    // Determine source projection
    let sourceProj = 'EPSG:4326'; // Default to WGS84
    if (header?.COSYS_EPSG) {
      const epsg = `EPSG:${header.COSYS_EPSG}`;
      if (proj4.defs(epsg)) {
        sourceProj = epsg;
      } else {
        console.warn(`Unknown EPSG code: ${header.COSYS_EPSG}, assuming raw coordinates are compatible or WGS84`);
      }
    } else if (header?.COSYS) {
        // Simple heuristic for COSYS string
        if (header.COSYS.includes('UTM') && header.COSYS.includes('32')) {
            sourceProj = 'EPSG:25832';
        } else if (header.COSYS.includes('UTM') && header.COSYS.includes('33')) {
            sourceProj = 'EPSG:25833';
        }
    }

    // Helper to transform coordinate
    const transform = (x, y) => {
      if (sourceProj === 'EPSG:4326') return [x, y]; // No transform needed if already WGS84
      try {
        return proj4(sourceProj, 'EPSG:4326', [x, y]);
      } catch (e) {
        return [x, y];
      }
    };

    // Process Lines
    lines.forEach((line, idx) => {
      if (line.coordinates && line.coordinates.length > 0) {
        const coords = line.coordinates.map(c => transform(c.x, c.y));
        features.push({
          type: 'Feature',
          properties: { ...line.attributes, id: idx, featureType: 'Line' },
          geometry: {
            type: 'LineString',
            coordinates: coords
          },
        });
      }
    });

    // Process Points
    points.forEach((point, idx) => {
      if (point.coordinates && point.coordinates.length > 0) {
        const c = point.coordinates[0];
        const coords = transform(c.x, c.y);
        features.push({
          type: 'Feature',
          properties: { ...point.attributes, id: idx, featureType: 'Point' },
          geometry: {
            type: 'Point',
            coordinates: coords
          },
        });
      }
    });

    return {
      type: 'FeatureCollection',
      features
    };
  }, [data]);

  if (!data || !geoJsonData) return null;

  const lineStyle = (feature) => {
    const fcode = feature.properties?.S_FCODE;
    const color = getColorByFCode(fcode);
    const weight = getLineWeight(feature.properties);
    
    return {
      color: color,
      weight: weight,
      opacity: 0.9,
      dashArray: fcode && fcode.includes('DR') ? '5, 5' : null,
    };
  };

  const pointToLayer = (feature, latlng) => {
    const fcode = feature.properties?.S_FCODE;
    const color = getColorByFCode(fcode);
    const isManhole = fcode && fcode.includes('KUM');

    return L.circleMarker(latlng, {
      radius: isManhole ? 6 : 5,
      fillColor: color,
      color: '#000',
      weight: isManhole ? 2 : 1,
      opacity: 1,
      fillOpacity: 0.8,
    });
  };

  const onEachFeature = (feature, layer) => {
    if (feature.properties) {
      const props = feature.properties;
      const fcode = props.S_FCODE;
      const color = getColorByFCode(fcode);
      
      let content = `<div class="text-sm max-h-60 overflow-auto">`;
      content += `<strong>Type:</strong> ${props.featureType}<br/>`;
      if (fcode) {
        content += `<strong>Code:</strong> <span style="color: ${color}; font-weight: bold;">${fcode}</span><br/>`;
      }
      
      content += '<div class="mt-2 border-t pt-1">';
      Object.entries(props).forEach(([key, value]) => {
        if (key !== 'featureType' && key !== 'id' && key !== 'S_FCODE' && value !== null && value !== '') {
          content += `<strong>${key}:</strong> ${value}<br/>`;
        }
      });
      content += '</div></div>';
      layer.bindPopup(content);
    }
  };

  return (
    <MapContainer
      center={[59.9139, 10.7522]}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Kartverket Topo">
          <TileLayer
            attribution='&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
            url="https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png"
            maxZoom={22}
            maxNativeZoom={18}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Kartverket Gråtone">
          <TileLayer
            attribution='&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
            url="https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png"
            maxZoom={22}
            maxNativeZoom={18}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="OpenStreetMap">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={22}
            maxNativeZoom={19}
          />
        </LayersControl.BaseLayer>

        <LayersControl.Overlay checked name="Data">
          <GeoJSON 
            data={geoJsonData} 
            style={lineStyle} 
            pointToLayer={pointToLayer}
            onEachFeature={onEachFeature}
          />
        </LayersControl.Overlay>
      </LayersControl>

      <BoundsController geoJsonData={geoJsonData} />
      {onZoomChange && <ZoomHandler onZoomChange={onZoomChange} />}
    </MapContainer>
  );
}

