//const ol = require('openlayers');
const fs = require('fs');

class MarkerManager {
    constructor(vectorSource) {
        this.vectorSource = vectorSource; // Векторный источник для всех маркеров

        this.isDrawing = false; // Флаг для отслеживания состояния рисования
        this.currentLine = null; // Хранение текущей линии
        this.lineStyle = null;
        this.markerStyle = null;
    }

    loadMarkersFile(paintMarkers, filename) {
        fs.readFile(filename, 'utf8', (err, data) => {

            const parsedData = JSON.parse(data);
            if (!parsedData.features || !Array.isArray(parsedData.features)) {
                return;
            }

            parsedData.features.forEach(feature => {
                // Пропуск маркеров с существующими ID
                const existingMarker = paintMarkers.find(marker => marker.getId() === feature.id);
                if (existingMarker) {
                    //console.log(`Маркер с ID ${feature.id} уже существует, пропускаем.`);
                    return;
                }

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

                    // Начало рисования линии
                    newMarker = this.startDrawingLine(params);
                    // Добавление оставшихся координат
                    coords.slice(1).forEach(coord => this.continueDrawingLine(coord));
                    this.stopDrawingLine();
                }

                if (newMarker) {
                    newMarker.setId(feature.id); // Восстановление ID из файла
                    paintMarkers.push(newMarker); // Добавление в текущий список маркеров
                }
            });
        });
    }

    saveMarkersFile(paintMarkers, filename) {

        // Создаем объект данных
        const data = {
            version: "1.0.0",
            //map: {
            //    center: {
            //        lon: Math.round(center[0] * 10000000) / 10000000,
            //        lat: Math.round(center[1] * 10000000) / 10000000
            //    },
            //    zoom: zoom
            //},
            features: [] // Маркеры и линии
        };

        // Проходим по всем объектам paintMarkers
        paintMarkers.forEach(marker => {
            const geometry = marker.getGeometry();
            if (geometry.getType() === 'Point') { // Текстовый маркер
                const coords = ol.proj.toLonLat(geometry.getCoordinates());
                data.features.push({
                    type: geometry.getType(),
                    coordinates: {
                        lon: Math.round(coords[0] * 10000000) / 10000000,
                        lat: Math.round(coords[1] * 10000000) / 10000000
                    },
                    id: marker.getId(),
                    properties: marker.get('property') //marker.getProperties()
                });
            }
            else if (geometry.getType() === 'LineString') { // Линия
                const coords = geometry.getCoordinates().map(coord => {
                    const [lon, lat] = ol.proj.toLonLat(coord);
                    return {
                        lon: Math.round(lon * 10000000) / 10000000,
                        lat: Math.round(lat * 10000000) / 10000000
                    };
                });
                data.features.push({
                    type: geometry.getType(),
                    coordinates: coords,
                    id: marker.getId(),
                    properties: marker.get('property') //marker.getProperties()
                });
            }
        });

        // Сохранение в файл
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
     * Создать маркер с текстом
     * @param {Array<number>} coordinate Координаты [x, y]
     * @param {string} name Имя маркера
     * @param {string} description Описание маркера
     * @param {string} color Цвет текста маркера
     * @param {number} fontSize Размер текста (в пикселях)
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
        marker.setId(`marker-${Date.now()}`); // ID на основе времени
        // this.vectorSource.addFeature(marker);
        return marker;
    }

    /**
     * Создать маркер с иконкой
     * @param {Array<number>} coordinate Координаты [x, y]
     * @param {string} iconUrl URL иконки
     * @param {string} name Имя маркера
     * @param {string} description Описание маркера
     * @param {number} scale Масштаб иконки
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

        marker.setId(`marker-${Date.now()}`); // ID на основе времени
        //this.vectorSource.addFeature(marker);
        return marker;
    }

    /**
     * Начать рисование линии
     * @param {Array<number>} startCoordinate - начальная координата линии
     * @returns {ol.Feature} - созданный объект линии
     */
    startDrawingLine(params) {
        this.isDrawing = true;
        this.currentLine = new ol.Feature({
            geometry: new ol.geom.LineString([params.coord]),
            property: params,
        });

        this.setLineStyle(params);
        this.currentLine.setStyle(this.lineStyle);
        this.currentLine.setId(`freeline-${Date.now()}`); // ID на основе времени
        return this.currentLine;
    }

    /**
     * Продолжить рисование линии
     * @param {Array<number>} coordinate - текущая координата для добавления
     */
    continueDrawingLine(coordinate) {
        if (!this.isDrawing || !this.currentLine) return;

        const geometry = this.currentLine.getGeometry();
        geometry.appendCoordinate(coordinate);
    }

    /**
     * Завершить рисование линии
     */
    stopDrawingLine() {
        this.isDrawing = false;
        this.currentLine = null;
    }

    /**
     * Получить координаты маркера
     * @param {ol.Feature} marker Маркер
     * @returns {Array<number>} Координаты [x, y]
     */
    getMarkerCoordinates(marker) {
        return marker.getGeometry().getCoordinates();
    }

    /**
     * Задать координаты маркера
     * @param {ol.Feature} marker Маркер
     * @param {Array<number>} coordinates Новые координаты [x, y]
     */
    setMarkerCoordinates(marker, coordinates) {
        marker.getGeometry().setCoordinates(coordinates);
    }

    /**
     * Получить свойство маркера (имя, описание, цвет и т.д.)
     * @param {ol.Feature} marker Маркер
     * @param {string} property Название свойства
     * @returns {*} Значение свойства
     */
    getMarkerProperty(marker, property) {
        return marker.get(property);
    }

    /**
     * Задать свойство маркера (имя, описание, цвет и т.д.)
     * @param {ol.Feature} marker Маркер
     * @param {string} property Название свойства
     * @param {*} value Значение свойства
     */
    setMarkerProperty(marker, property, value) {
        marker.set(property, value);

        // Если изменяется стиль текста, обновляем стиль
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