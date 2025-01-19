const fs = require('fs');

class MarkerManager {
    constructor(map, vectorLayer) {
        this.map = map;
        this.vectorLayer = vectorLayer;
        this.paintMarkers = [];

        this.isDrawing = false;
        this.currentLine = null;
        this.lineStyle = null;
        this.markerStyle = null;
    }

    static currentPoly;
    static getCurrentPoly() {
        return this.currentPoly;
    }
    static setCurrentPoly(poly) {
        this.currentPoly = poly;
    }
    createPolyOrMeasure(type) {

        let params = {
            description: 'description poly1111111',
            strokeColor: 'blue',
            fillColor: 'white',
            width: 16,
            kind: 'polygon',
        };

        let poly = new Polygon(type, this.map, this.vectorLayer, this.paintMarkers);//, null, params);
        setCurrentPoly(poly);
    }

    loadMarkersFile(filename) {
        fs.readFile(filename, 'utf8', (err, data) => {

            const parsedData = JSON.parse(data);
            if (!parsedData.features || !Array.isArray(parsedData.features)) {
                return;
            }

            let center = ol.proj.fromLonLat([parsedData.map.center.lon, parsedData.map.center.lat]);
            this.map.getView().setCenter(center);
            this.map.getView().setZoom(parsedData.map.zoom);

            parsedData.features.forEach(feature => {

                let newMarker;
                const params = feature.properties || {};

                if (params.kind === "drawMarker") {
                    const coords = ol.proj.fromLonLat([feature.coordinates.lon, feature.coordinates.lat]);
                    params.coord = coords;

                    if (params.iconUrl) {
                        //newMarker = this.createIconMarker(coords, params.iconUrl, params.name, params.description, params.scale);
                    }
                    else {
                        newMarker = this.createTextMarker(params);
                    }
                }
                else if (params.kind === "freeline") {
                    const coords = feature.coordinates.map(coord =>
                        ol.proj.fromLonLat([coord.lon, coord.lat])
                    );
                    params.coord = coords[0];

                    newMarker = this.startDrawingLine(params);
                    coords.slice(1).forEach(coord => this.continueDrawingLine(coord));
                    this.stopDrawingLine();
                }

                else if (params.kind === 'polygon') {

                    let coords;

                    if (feature.type === 'Polygon') {
                        coords = feature.coordinates.map(ring =>
                            ring.map(coord => ol.proj.fromLonLat([coord.lon, coord.lat]))
                        );

                        coords = coords[0];
                    }
                    else
                        coords = feature.coordinates.map(coord =>
                            ol.proj.fromLonLat([coord.lon, coord.lat])
                        );

                    let poly = new Polygon(feature.type, this.map, this.vectorLayer, this.paintMarkers, coords, params);
                    MarkerManager.setCurrentPoly(poly);
                }

                if (newMarker) {
                    newMarker.setId(feature.id);
                    this.paintMarkers.push(newMarker);
                    //this.vectorLayer.getSource().addFeature(newMarker);
                }
            });
        });
    }

    saveMarkersFile(filename) {

        const center = ol.proj.toLonLat(this.map.getView().getCenter());
        const zoom = this.map.getView().getZoom();
        const data = {
            version: "1.0.0",
            map: {
                center: {
                    lon: Math.round(center[0] * 10000000) / 10000000,
                    lat: Math.round(center[1] * 10000000) / 10000000
                },
                zoom: zoom
            },
            features: []
        };
        
        this.paintMarkers.forEach(marker => {

            let coords;
            const geometry = marker.getGeometry();

            if (geometry.getType() === 'Point') { // Text Marker
                const [lon, lat] = ol.proj.toLonLat(geometry.getCoordinates());
                coords = {
                    lon: Math.round(lon * 10000000) / 10000000,
                    lat: Math.round(lat * 10000000) / 10000000
                };
            }
            else if (geometry.getType() === 'LineString') { // Free line
                coords = geometry.getCoordinates().map(coord => {
                    const [lon, lat] = ol.proj.toLonLat(coord);
                    return {
                        lon: Math.round(lon * 10000000) / 10000000,
                        lat: Math.round(lat * 10000000) / 10000000
                    };
                });
            }
            else if (geometry.getType() === 'Polygon') {
                coords = geometry.getCoordinates().map(ring =>
                    ring.map(coord => {
                        const [lon, lat] = ol.proj.toLonLat(coord);
                        return {
                            lon: Math.round(lon * 10000000) / 10000000,
                            lat: Math.round(lat * 10000000) / 10000000
                        };
                    })
                );
            }

            data.features.push({
                type: geometry.getType(),
                coordinates: coords,
                id: marker.getId(),
                properties: marker.get('property') //marker.getProperties()
            });
        });

        // File Save
        const json = JSON.stringify(data, null, 2);
        fs.writeFile(filename, json, err => {
            if (err) {
                return GUI.log(err);
            }
        });
    }

    setLineStyle(params) {
        this.lineStyle = new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: params.color || 'blue',
                width: params.width || 2,
                lineDash: params.lineDash || null,
            }),
        });
    }

    setMarkerStyle(params) {
        this.markerStyle = new ol.style.Style({
            text: new ol.style.Text({
                text: params.name,
                font: `${params.fontSize}px Arial, sans-serif`,
                fill: new ol.style.Fill({ color: params.color }),
                stroke: new ol.style.Stroke({ color: 'white', width: 2 }),
            }),
        });
    }

    createTextMarker(params) {
        const marker = new ol.Feature({
            geometry: new ol.geom.Point(params.coord),
            property: params,
            //name: params.name,
            //description: params.description,
            //color: params.color,
            //fontSize: params.fontSize,
        });

        this.setMarkerStyle(params);
        marker.setStyle(this.markerStyle);
        marker.setId(`marker-${Date.now()}`);
        this.paintMarkers.push(marker);
        this.vectorLayer.getSource().addFeature(marker);
        return marker;
    }

    // TODO
    createIconMarker(coordinate, iconUrl, name, description = '', scale = 1) {
        const marker = new ol.Feature({
            geometry: new ol.geom.Point(coordinate),
            name: name,
            description: description,
            iconUrl: iconUrl,
            scale: scale,
        });

        marker.setStyle(
            new ol.style.Style({
                image: new ol.style.Icon({
                    anchor: [0.5, 1],
                    src: iconUrl,
                    scale: scale,
                }),
            })
        );

        marker.setId(`marker-${Date.now()}`);
        //this.vectorSource.addFeature(marker);
        return marker;
    }
    
    startDrawingLine(params) {
        this.isDrawing = true;
        this.currentLine = new ol.Feature({
            geometry: new ol.geom.LineString([params.coord]),
            property: params,
        });

        this.setLineStyle(params);
        this.currentLine.setStyle(this.lineStyle);
        this.currentLine.setId(`freeline-${Date.now()}`);
        this.paintMarkers.push(this.currentLine);
        this.vectorLayer.getSource().addFeature(this.currentLine);

        return this.currentLine;
    }
    
    continueDrawingLine(coordinate) {
        if (!this.isDrawing || !this.currentLine) return;

        const geometry = this.currentLine.getGeometry();
        geometry.appendCoordinate(coordinate);
        this.vectorLayer.getSource().addFeature(this.currentLine);
    }
   
    stopDrawingLine() {
        this.isDrawing = false;
        this.currentLine = null;
    }
    
    getMarkerCoordinates(marker) {
        return marker.getGeometry().getCoordinates();
    }
    
    setMarkerCoordinates(marker, coordinates) {
        marker.getGeometry().setCoordinates(coordinates);
    }
    
    getMarkerProperty(marker, property) {
        return marker.get(property);
    }
    
    setMarkerProperty(marker, property, value) {
        marker.set(property, value);
        
        if (property === 'name' || property === 'color' || property === 'fontSize') {
            const style = marker.getStyle();
            if (style && style.getText()) {
                style.getText().setText(marker.get('name'));
                style.getText().getFill().setColor(marker.get('color'));
                style.getText().setFont(`${marker.get('fontSize')}px Arial, sans-serif`);
            }
        }
    }
}

class Overlay {
    constructor(map, element = document.getElementById("popup"), offset = [0, -15], positioning = 'bottom-center', className = 'ol-tooltip-measure ol-tooltip .ol-tooltip-static') {
        this.map = map;
        this.overlay = new ol.Overlay({
            element: element,
            offset: offset,
            positioning: positioning,
            className: className
        });
        this.overlay.setPosition([0, 0]);
        this.overlay.element.style.display = 'block';
        this.map.addOverlay(this.overlay);
    }
}

class Polygon {
    constructor(type, map, vector_layer, paintMarkers, coordinates = null, properties = {
        description: 'description poly',
        strokeColor: '#0e97fa',
        fillColor: 'rgba(0, 153, 255, 0.2)',
        width: 4,
        kind: 'polygon',
    }) {
        this.type = type;
        this.map = map;
        this.vector_layer = vector_layer;
        this.paintMarkers = paintMarkers;
        this.overlays = [];
        this.properties = properties;
        this.isPolygonFinished = false;

        // create polygon by existing coordinates or by mouse clicking at the map
        if (coordinates) this.createPolygonFromCoordinates(coordinates);
        else this.initDrawInteraction();
    }

    // Start draw points for polygon
    initDrawInteraction() {
        this.draw = new ol.interaction.Draw({
            type: this.type,
            stopClick: true
        });

        this.draw.on('drawstart', this.onDrawStart);
        this.draw.on('drawend', this.onDrawEnd);
        document.addEventListener('keydown', this.handleKeyDown);

        this.map.addInteraction(this.draw);
        MarkerManager.setCurrentPoly(this);
    }

    createPolygonFromCoordinates(coordinates) {
        
        const firstPoint = coordinates[0].map(coord => Math.round(coord));
        const lastPoint = coordinates[coordinates.length - 1].map(coord => Math.round(coord));
        const isClosed = (firstPoint[0] === lastPoint[0]) && (firstPoint[1] === lastPoint[1]);
        let geometry;

        if (isClosed) geometry = new ol.geom.Polygon([coordinates]);
        else geometry = new ol.geom.LineString(coordinates);

        const feature = new ol.Feature({
            geometry: geometry,
            property: this.properties
        });
        feature.setStyle(this.setStyle(this.properties));

        feature.setId(`polygon - ${ Date.now() }`);
        feature.getGeometry().on('change', this.onGeomChange);
        this.vector_layer.getSource().addFeature(feature);
        this.paintMarkers.push(feature);

        // Load Overlays
        for (let i = 0; i < coordinates.length - 1; i++) {
            const line = new ol.geom.LineString([coordinates[i], coordinates[i + 1]]);
            const midpoint = this.calculateMidpoint(line.getCoordinates());
            const distance = ol.Sphere.getLength(line);
            const overlay = new Overlay(this.map).overlay;
            this.overlays.push(overlay);
            this.calDistance(overlay, midpoint, distance);
        }

        // If it's a polygon then add overlay of square
        if (isClosed) {
            const area = ol.Sphere.getArea(geometry);
            const centroid = this.calculateCentroid(geometry);
            this.totalAreaOverlay = new Overlay(this.map).overlay;
            this.calArea(this.totalAreaOverlay, centroid, area);
        }
        
        this.isPolygonFinished = true;
    }

    onDrawStart = (e) => {
        try {
            this.isPolygonFinished = false;
            this.coordinates_length = 0;
            this.totalAreaOverlay = new Overlay(this.map).overlay;

            e.feature.getGeometry().on('change', this.onGeomChange);
            e.feature.setStyle(this.setStyle(this.properties));

        } catch (err) {
            GUI.log(err);
        }
    }

    onDrawEnd = (e) => {
        
        let lastOverlay = this.overlays.pop();
        this.map.removeOverlay(lastOverlay); // bugfix with last overlay

        this.properties.kind = 'polygon';
        e.feature.set('property', this.properties);
        e.feature.setId(`polygon-${Date.now()}`);
        this.vector_layer.getSource().addFeature(e.feature);
        this.paintMarkers.push(e.feature);

        this.isPolygonFinished = true;
        this.map.removeInteraction(this.draw);
        new Polygon(this.type, this.map, this.vector_layer, this.paintMarkers, null, this.properties);
    }

    onGeomChange = (e) => {
        try {
            const geomType = e.target.getType();
            let coordinates = e.target.getCoordinates();

            if (geomType === "Polygon") coordinates = coordinates[0];
            
            // Refresh Overlays
            this.overlays.forEach((overlay, index) => {
                if (index < coordinates.length - 1) {
                    const line = new ol.geom.LineString([coordinates[index], coordinates[index + 1]]);
                    const midpoint = this.calculateMidpoint(line.getCoordinates());
                    const distance = ol.Sphere.getLength(line);
                    this.calDistance(overlay, midpoint, distance);
                }
            });

            // Calculate Square of polygon
            if (geomType === "Polygon") {
                const polygon = new ol.geom.Polygon([coordinates]);
                const area = ol.Sphere.getArea(polygon);
                const centroid = this.calculateCentroid(e.target);
                this.calArea(this.totalAreaOverlay, centroid, area);
            }

            // Add a new overlay for every new created line
            if (coordinates.length > this.overlays.length + 1) {
                const line = new ol.geom.LineString([coordinates[coordinates.length - 2], coordinates[coordinates.length - 1]]);
                const overlay = new Overlay(this.map).overlay;
                this.overlays.push(overlay);
                const midpoint = this.calculateMidpoint(line.getCoordinates());
                const distance = ol.Sphere.getLength(line);
                this.calDistance(overlay, midpoint, distance);
            }
        } catch (err) {
            GUI.log(err);
        }
    };

    // Calculate midpoint of coords
    calculateMidpoint = (coordinates) => {
        const [x1, y1] = coordinates[0];
        const [x2, y2] = coordinates[1];
        return [(x1 + x2) / 2, (y1 + y2) / 2];
    }

    // Calculate centroid by jsts lib
    calculateCentroid = (geometry) => {
        const jstsGeom = new jsts.io.OL3Parser().read(geometry);
        const centroid = jstsGeom.getCentroid();
        return [centroid.getX(), centroid.getY()];
    }

    // Calculate pos and dist for Overlay
    calDistance = (overlay, overlayPosition, distance) => {
        if (distance === 0) {
            overlay.setPosition([0, 0]);
        } else {
            overlay.setPosition(overlayPosition);
            if (distance >= 1000) {
                overlay.element.innerHTML = (distance / 1000).toFixed(2) + ' km';
            } else {
                overlay.element.innerHTML = distance.toFixed(2) + ' m';
            }
        }
    }

    // Calculate pos and square for Overlay
    calArea = (overlay, overlayPosition, area) => {
        if (area === 0) {
            overlay.setPosition([0, 0]);
        } else {
            overlay.setPosition(overlayPosition);
            if (area >= 10000) {
                overlay.element.innerHTML = Math.round((area / 1000000) * 100) / 100 + ' km<sup>2</sup>';
            } else {
                overlay.element.innerHTML = Math.round(area * 100) / 100 + ' m<sup>2</sup>';
            }
        }
    }

    handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            this.cancelDrawing();
        }
    };

    cancelDrawing = () => {
        if (!this.isPolygonFinished) {

            this.map.removeInteraction(this.draw);
            this.clearAllOverlays();

            if (this.currentFeature) {
                this.vector_layer.getSource().removeFeature(this.currentFeature);
            }

            document.removeEventListener('keydown', this.handleKeyDown);
            //new Polygon(this.type, this.map, this.vector_layer);
        }
    };

    clearAllOverlays = () => {
        if (this.overlays.length > 2) this.map.removeOverlay(this.totalAreaOverlay);
        this.overlays.forEach((overlay) => {
            this.map.removeOverlay(overlay);
        });
        this.overlays = [];
    }

    setStyle(params) {

        let Style = new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: params.strokeColor,
                width: params.width
            }),
            fill: new ol.style.Fill({
                color: params.fillColor
            })
        });

        return Style;
    }
}
