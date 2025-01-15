//const ol = require('openlayers');
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
    createPoly(type) {
        let poly = new Polygon(type, this.map, this.vectorLayer, this.paintMarkers);
        setCurrentPoly(poly);
    }

    loadMarkersFile(/*paintMarkers, */filename) {
        fs.readFile(filename, 'utf8', (err, data) => {

            const parsedData = JSON.parse(data);
            if (!parsedData.features || !Array.isArray(parsedData.features)) {
                return;
            }

            parsedData.features.forEach(feature => {
                // ������� �������� � ������������� ID
                //const existingMarker = this.paintMarkers.find(marker => marker.getId() === feature.id);
                //if (existingMarker) {
                //    //console.log(`������ � ID ${feature.id} ��� ����������, ����������.`);
                //    return;
                //}

                let newMarker;
                const params = feature.properties || {};

                if (feature.type === 'Point') {
                    const coords = ol.proj.fromLonLat([feature.coordinates.lon, feature.coordinates.lat]);
                    params.coord = coords;

                    if (params.iconUrl) {
                        //newMarker = this.createIconMarker(coords, params.iconUrl, params.name, params.description, params.scale);
                    }
                    else {
                        newMarker = this.createTextMarker(params);
                    }
                }
                else if (feature.type === 'LineString') {
                    const coords = feature.coordinates.map(coord =>
                        ol.proj.fromLonLat([coord.lon, coord.lat])
                    );
                    params.coord = coords[0];

                    // ������ ��������� �����
                    newMarker = this.startDrawingLine(params);
                    // ���������� ���������� ���������
                    coords.slice(1).forEach(coord => this.continueDrawingLine(coord));
                    this.stopDrawingLine();
                }

                else if (feature.type === 'Polygon') {
                    const coords = feature.coordinates.map(ring =>
                        ring.map(coord => ol.proj.fromLonLat([coord.lon, coord.lat]))
                    );

                    let poly = new Polygon(feature.type, this.map, this.vectorLayer, this.paintMarkers, coords[0]);
                    MarkerManager.setCurrentPoly(poly);

                    //newMarker = new ol.Feature({
                    //    geometry: new ol.geom.Polygon(coords),
                    //    property: params,
                    //});
                    //this.vectorLayer.getSource().addFeature(newMarker);

                    //polygonFeature.setId(feature.id);

                    //this.paintMarkers.push(polygonFeature);

                    // �������� ��������
                    //const polyInstance = new Polygon('Polygon', this.map, this.vectorLayer, this.paintMarkers);
                    //polyInstance.recalculateOverlays(newMarker);
                }

                if (newMarker) {
                    newMarker.setId(feature.id); // �������������� ID �� �����
                    this.paintMarkers.push(newMarker); // ���������� � ������� ������ ��������
                    //this.vectorLayer.getSource().addFeature(newMarker);
                }
            });
        });
    }

    saveMarkersFile(/*paintMarkers, */filename) {

        // ������� ������ ������
        const data = {
            version: "1.0.0",
            //map: {
            //    center: {
            //        lon: Math.round(center[0] * 10000000) / 10000000,
            //        lat: Math.round(center[1] * 10000000) / 10000000
            //    },
            //    zoom: zoom
            //},
            features: [] // ������� � �����
        };

        // �������� �� ���� �������� paintMarkers
        this.paintMarkers.forEach(marker => {

            let coords;
            const geometry = marker.getGeometry();

            if (geometry.getType() === 'Point') { // ��������� ������
                const [lon, lat] = ol.proj.toLonLat(geometry.getCoordinates());
                coords = {
                    lon: Math.round(lon * 10000000) / 10000000,
                    lat: Math.round(lat * 10000000) / 10000000
                };
            }
            else if (geometry.getType() === 'LineString') { // �����
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

        // ���������� � ����
        const json = JSON.stringify(data, null, 2);
        fs.writeFile(filename, json, err => {
            if (err) {
                return console.error(err);
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

    /**
     * ������� ������ � �������
     * @param {Array<number>} coordinate ���������� [x, y]
     * @param {string} name ��� �������
     * @param {string} description �������� �������
     * @param {string} color ���� ������ �������
     * @param {number} fontSize ������ ������ (� ��������)
     */
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
        marker.setId(`marker-${Date.now()}`); // ID �� ������ �������
        this.paintMarkers.push(marker);
        this.vectorLayer.getSource().addFeature(marker);
        // this.vectorSource.addFeature(marker);
        return marker;
    }

    /**
     * ������� ������ � �������
     * @param {Array<number>} coordinate ���������� [x, y]
     * @param {string} iconUrl URL ������
     * @param {string} name ��� �������
     * @param {string} description �������� �������
     * @param {number} scale ������� ������
     */
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

        marker.setId(`marker-${Date.now()}`); // ID �� ������ �������
        //this.vectorSource.addFeature(marker);
        return marker;
    }

    /**
     * ������ ��������� �����
     * @param {Array<number>} startCoordinate - ��������� ���������� �����
     * @returns {ol.Feature} - ��������� ������ �����
     */
    startDrawingLine(params) {
        this.isDrawing = true;
        this.currentLine = new ol.Feature({
            geometry: new ol.geom.LineString([params.coord]),
            property: params,
        });

        this.setLineStyle(params);
        this.currentLine.setStyle(this.lineStyle);
        this.currentLine.setId(`freeline-${Date.now()}`); // ID �� ������ �������
        this.paintMarkers.push(this.currentLine);
        this.vectorLayer.getSource().addFeature(this.currentLine);

        return this.currentLine;
    }

    /**
     * ���������� ��������� �����
     * @param {Array<number>} coordinate - ������� ���������� ��� ����������
     */
    continueDrawingLine(coordinate) {
        if (!this.isDrawing || !this.currentLine) return;

        const geometry = this.currentLine.getGeometry();
        geometry.appendCoordinate(coordinate);
        this.vectorLayer.getSource().addFeature(this.currentLine);
    }

    /**
     * ��������� ��������� �����
     */
    stopDrawingLine() {
        this.isDrawing = false;
        this.currentLine = null;
    }

    /**
     * �������� ���������� �������
     * @param {ol.Feature} marker ������
     * @returns {Array<number>} ���������� [x, y]
     */
    getMarkerCoordinates(marker) {
        return marker.getGeometry().getCoordinates();
    }

    /**
     * ������ ���������� �������
     * @param {ol.Feature} marker ������
     * @param {Array<number>} coordinates ����� ���������� [x, y]
     */
    setMarkerCoordinates(marker, coordinates) {
        marker.getGeometry().setCoordinates(coordinates);
    }

    /**
     * �������� �������� ������� (���, ��������, ���� � �.�.)
     * @param {ol.Feature} marker ������
     * @param {string} property �������� ��������
     * @returns {*} �������� ��������
     */
    getMarkerProperty(marker, property) {
        return marker.get(property);
    }

    /**
     * ������ �������� ������� (���, ��������, ���� � �.�.)
     * @param {ol.Feature} marker ������
     * @param {string} property �������� ��������
     * @param {*} value �������� ��������
     */
    setMarkerProperty(marker, property, value) {
        marker.set(property, value);

        // ���� ���������� ����� ������, ��������� �����
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
    constructor(type, map, vector_layer, paintMarkers, coordinates = null) {
        this.type = type;
        this.map = map;
        this.vector_layer = vector_layer;
        this.paintMarkers = paintMarkers;
        this.overlays = []; // ������ ��� �������� ���� ��������
        this.isPolygonFinished = false;

        if (coordinates) {
            this.createPolygonFromCoordinates(coordinates);
        } else {
            this.initDrawInteraction();
        }
    }

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
        // ������� ������ �������� �� ���������
        const polygon = new ol.geom.Polygon([coordinates]);
        const feature = new ol.Feature(polygon);
        feature.setId(`polygon-${Date.now()}`);
        feature.getGeometry().on('change', this.onGeomChange);
        this.vector_layer.getSource().addFeature(feature);
        this.paintMarkers.push(feature);

        // ��������� ������� ��� ������� �������� ��������
        for (let i = 0; i < coordinates.length - 1; i++) {
            const line = new ol.geom.LineString([coordinates[i], coordinates[i + 1]]);
            const midpoint = this.calculateMidpoint(line.getCoordinates());
            const distance = ol.Sphere.getLength(line);
            const overlay = new Overlay(this.map).overlay;
            this.overlays.push(overlay);
            this.calDistance(overlay, midpoint, distance);
        }

        // ��������� ������� ��� �������
        const area = ol.Sphere.getArea(polygon);
        const centroid = this.calculateCentroid(polygon);
        this.totalAreaOverlay = new Overlay(this.map).overlay;
        this.calArea(this.totalAreaOverlay, centroid, area);

        // ��������� ��������� ������������ ��������
        this.isPolygonFinished = true;
    }

    onDrawStart = (e) => {
        try {
            this.isPolygonFinished = false;
            this.coordinates_length = 0;
            this.totalAreaOverlay = new Overlay(this.map).overlay; // ������� ��� �������
            e.feature.getGeometry().on('change', this.onGeomChange);
        } catch (err) {
            console.error(err);
        }
    }

    onDrawEnd = (e) => {
        let lastOverlay = this.overlays.pop();
        this.map.removeOverlay(lastOverlay);

        e.feature.setId(`polygon-${Date.now()}`); // ID �� ������ �������
        this.vector_layer.getSource().addFeature(e.feature);
        this.paintMarkers.push(e.feature);

        this.isPolygonFinished = true;
        this.map.removeInteraction(this.draw);
        new Polygon(this.type, this.map, this.vector_layer, this.paintMarkers);
    }

    onGeomChange = (e) => {
        try {
            const geomType = e.target.getType();
            let coordinates = e.target.getCoordinates();

            if (geomType === "Polygon") {
                coordinates = coordinates[0]; // �������� ������ � ������� ��������
            }
            
            // ��������� ��� ������������ �������
            this.overlays.forEach((overlay, index) => {
                if (index < coordinates.length - 1) {
                    const line = new ol.geom.LineString([coordinates[index], coordinates[index + 1]]);
                    const midpoint = this.calculateMidpoint(line.getCoordinates());
                    const distance = ol.Sphere.getLength(line);
                    this.calDistance(overlay, midpoint, distance);
                }
            });

            // ��� Polygon: ������ �������
            if (geomType === "Polygon") {
                const polygon = new ol.geom.Polygon([coordinates]);
                const area = ol.Sphere.getArea(polygon);
                const centroid = this.calculateCentroid(e.target);
                this.calArea(this.totalAreaOverlay, centroid, area);
            }

            // ���������� ������ �������, ���� ��������� ����� �����
            if (coordinates.length > this.overlays.length + 1) {
                const line = new ol.geom.LineString([coordinates[coordinates.length - 2], coordinates[coordinates.length - 1]]);
                const overlay = new Overlay(this.map).overlay;
                this.overlays.push(overlay);
                const midpoint = this.calculateMidpoint(line.getCoordinates());
                const distance = ol.Sphere.getLength(line);
                this.calDistance(overlay, midpoint, distance);
            }
        } catch (err) {
            console.error(err);
        }
    };

    calculateMidpoint = (coordinates) => {
        const [x1, y1] = coordinates[0];
        const [x2, y2] = coordinates[1];
        return [(x1 + x2) / 2, (y1 + y2) / 2];
    }

    calculateCentroid = (geometry) => {
        const jstsGeom = new jsts.io.OL3Parser().read(geometry);
        const centroid = jstsGeom.getCentroid();
        return [centroid.getX(), centroid.getY()];
    }

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

            // ������� ������������� ������� (���� �� ��� �������� � ����)
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
}

