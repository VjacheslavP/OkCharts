var Map = function(settings) {
    var self = this;
    this.settings = {
        max_zoom: 4,
        max_canvas_size: 10000,
        css_names: ["width", "height", "left", "top"],
        world_filename: "ne_50m_admin_0_countries.json",
        russia_filename: "RUS_adm1.json",
        example_filename: "example_data.json",
        zoom_step: 1.5,
        canvas_styles: {
            country: {
                stroke: '#2980b9',
                fill: '#ecf0f1'
            },
            tooltip: {
                stroke: "#d35400",
                fill: "rgba(241, 196, 15, 0.9)",
                text: {
                    fill: "#2c3e50"
                }
            },
            country_hover: {
                fill: 'rgba(46, 204, 113, .5)'
            },
            container: {
                stroke: "#7f8c8d"
            }
        },
        canvas_id: "map",
        canvas_hover_id: "map_hover",
        container_id: "map_container",
        translate_horizontal: false //use it only for Russia
    };

    this.updateSettings = function(settings) {
        console.log(settings);
        if (typeof settings === "object")
            for (var setting in settings)
                if (setting in self.settings)
                    self.settings[setting] = settings[setting];
    }(settings); //run function

    this.getSetting = function(setting) {
        return this.settings[setting];
    };

    this.field = {};
    this.currentzoom = 1;
    this.scale = 1;
    this.canvas = document.getElementById(this.settings.canvas_id);
    this.canvas_hover = document.getElementById(this.settings.canvas_hover_id);
    this.map_container = document.getElementById(this.settings.container_id);
    this.ctx = this.canvas.getContext("2d");
    this.ctx_hover = this.canvas_hover.getContext("2d");
    this.statistics = {};
    this.pressed = false;
    this.current_zoom = 1;
    this.disable_moving = function() {
        self.pressed = false;
        self.canvas.className = "";
        self.canvas_hover.className = "";
    };

    function getCssStyle(e, name, number) {
        if (!isset(number))
            number = true;
        var value = getComputedStyle(e).getPropertyValue(name);
        return (number) ? parseInt(value) : value;
    }

    function setCssStyle(e, name, value) {
        value = typeof value === "number" ? value + "px" : value;
        e.style[name] = value;
    }

    var updateCSS = function() {
        var css = {
            canvas: {
                width: "100%",
                position: "absolute",
                left: "0",
                top: "0",
                transition: "0.5s"
            },
            canvas_hover: {
                position: "absolute",
                left: "0",
                top: "0",
                width: "100%",
                transition: "0.5s"
            },
            map_container: {
                position: "relative",
                width: "100%",
                border: "1px solid " + self.settings.canvas_styles.container.stroke,
                overflow: "hidden"
            }
        };

        var e_keys = Object.keys(css);
        for (var i in e_keys) {
            var css_keys = Object.keys(css[e_keys[i]]);
            for (var j in css_keys)
                setCssStyle(self[e_keys[i]], css_keys[j], css[e_keys[i]][css_keys[j]]);
        }
    }(); //run function

//private:
    function isset(variable) {
        return (typeof variable !== "undefined");
    }

    this.getCoords = function(geometry) {
        switch (geometry.type) {
            case 'Polygon' :
                return geometry.coordinates;
            case 'MultiPolygon' :
                if (geometry.type == 'MultiPolygon') {
                    var coords = [],
                        coordinates = geometry.coordinates;
                    for (var i in coordinates) {
                        for (var j in coordinates[i])
                            coords.push(coordinates[i][j]);
                    }
                }
                return coords;
        }
        console.info("unknown type of geometry '"+geometry.type+"'");
        return [];
    };

    function getColor(p) {
        var red, green, min = 0, max = 255 - min;
        if (p > 0) {
            green = max;
            red = 0;
        } else {
            red = max;
            green = 0;
            p = -p;
        }
        return "rgba("+red+","+green+",0,"+p+")";
    }

//public:
    this.translateX = function(x) {
        return x - this.bbox[0] + this.bbox[2];
    };

    this.getX = function(x) {
        return this.settings.translate_horizontal && x < 0 ? this.translateX(x) : x;
    };

    this.getGeometry = function(country) {
        switch (this.geodata.type) {
            case "FeatureCollection" : return country.geometry;
            case "GeometryCollection" : return country;
        }
        console.error("unknown type of data (geometries)");
    };

    this.getCanvasStyles = function() {
        return this.settings.canvas_styles;
    };

    this.getCssSize = function(e) {
        var values = this.settings.css_names,
            size = {},
            c = getComputedStyle(e);
        for (var i in values)
            size[values[i]] = parseInt(c.getPropertyValue(values[i]));
        return size;
    };

    this.setCssSize = function(e, size) {
        var values = this.settings.css_names;
        for (var i in values)
            if (isset(size[values[i]]))
                setCssStyle(e, values[i], size[values[i]]);
    };

    this.setCssStyleBoth = function(name, value, add, number) {
        if (!isset(add))
            add = false;
        if (!isset(number))
            number = true;
        if (add)
            value += getCssStyle(this.canvas, name, number);
        setCssStyle(this.canvas, name, value);
        setCssStyle(this.canvas_hover, name, value);
    };

    this.getCountries = function(data) {
        var data = isset(data) ? data : this.geodata;
        switch (data.type) {
            case "FeatureCollection" : return data.features;
            case "GeometryCollection" : return data.geometries;
        }
        console.error("unknown type of data (countries)");
    };

    this.getCountryName = function(country) {
        var p = country.properties,
            name = p.name_long;
        if (typeof name == "undefined")
            name = p.NAME_1;
        return name;
    };

    this.getMapPos = function(e, map, element) {
        if (!isset(map))
            map = true;
        if (!isset(element))
            element = this.canvas;
        var border_left =   getCssStyle(element, "border-left-width"),
            border_right =  getCssStyle(element, "border-right-width"),
            border_top =    getCssStyle(element, "border-top-width"),
            border_bottom = getCssStyle(element, "border-bottom-width"),
            cwidth = element.offsetWidth - border_left - border_right,
            cheight = element.offsetHeight - border_top - border_bottom,
            posx = (e.offsetX  - border_left),
            posy = (e.offsetY  - border_top),
            wk = cwidth / element.width,
            hk = cheight / element.height,
            x = this.field.width - ((cwidth - posx) / wk / this.scale) + this.tx0,
            y = ((cheight - posy) / hk / this.scale) + this.bbox[1];
        return (map) ? {x: x, y: y} : {x: posx, y: posy};
    };

    this.prepareCanvas = function(canvas, ctx) {
        canvas.width = this.field.width * this.scale;
        canvas.height = this.field.height * this.scale;
        ctx.fillStyle = this.getCanvasStyles().country.fill;
        ctx.strokeStyle = this.getCanvasStyles().country.stroke;
        var tx = -this.bbox[0],
            ty = this.bbox[3];
        if (this.settings.translate_horizontal)
            tx = -this.tx0;
        ctx.translate(tx * this.scale, ty * this.scale);
        ctx.scale(-1, 1);
        ctx.rotate(180 * Math.PI / 180);
    };

//drawing methods
    this.clearCanvas = function(ctx) {
        ctx.clearRect(this.tx0 * this.scale, this.bbox[1] * this.scale, this.canvas.width, this.canvas.height);
    };

    this.drawTooltip = function(ctx, text, point) {
        function getTextWidth(text) {
            var w = 0;
            for (var i in text) {
                var m = ctx.measureText(text[i]);
                w = Math.max(w, m.width);
            }
            return w;
        }

        if (typeof text == "string")
            text = [text];
        var text_scale = this.settings.max_zoom / this.current_zoom,
            h = 18 * window.devicePixelRatio * text_scale;
        ctx.font = h + "px Arial";
        var w = getTextWidth(text);

        if (w == 0)
            return;

        var padding = 5 * text_scale,
            texth = h * text.length,
            rectw = w + padding * 2,
            recth = texth + padding * 2,
            x = point.x * this.scale,
            y = -point.y * this.scale;

        y -= texth + padding * 2;

        if ((this.bbox[3] - point.y) * this.scale < recth) {
            y += recth;
            if (x - rectw > this.bbox[0] * this.scale)
                x -= rectw;
        }
        if (x + rectw > this.bbox[2] * this.scale)
            x -= rectw;

        var rectx = x,
            recty = y,
            textx = x + padding,
            texty = y + h + padding/3;

        ctx.save();
        ctx.scale(-1, 1);
        ctx.rotate(180 * Math.PI / 180);
        //rect
        ctx.fillStyle = this.getCanvasStyles().tooltip.fill;
        ctx.strokeStyle = this.getCanvasStyles().tooltip.stroke;
        ctx.beginPath();
        ctx.rect(rectx, recty, rectw, recth);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        //text
        ctx.fillStyle = this.getCanvasStyles().tooltip.text.fill;
        ctx.beginPath();
        for (var i in text)
            ctx.fillText(text[i], textx, texty + h * i);
        ctx.closePath();

        ctx.restore();
    };

    this.drawCountry = function(country, ctx) {
        function drawPolygon(coords, ctx) {
            function getPoint(coords) {
                var scale = self.scale,
                    x = self.getX(coords[0]),
                    y = coords[1];
                return {
                    x: x * scale,
                    y: y * scale
                };
            }
            var point=getPoint(coords[0]);
            ctx.beginPath();
            ctx.moveTo(point.x, point.y);
            for (var i = 1; i < coords.length; i++) {
                point=getPoint(coords[i]);
                ctx.lineTo(point.x, point.y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.fill();
        }
        var coords = this.getCoords(this.getGeometry(country));
        for (var i in coords)
            drawPolygon(coords[i], ctx);
    };

    this.drawMap = function(countries) {
        countries = (isset(countries)) ? countries : this.getCountries();
        for (var i in countries) {
            var logins = this.getCountryInfo(i).logins;
            this.ctx.fillStyle = (isset(logins)) ? logins.color : this.getCanvasStyles().country.fill;
            this.drawCountry(countries[i], this.ctx);
        }
    };

    this.drawAll = function() {
        console.time("drawAll");
        this.clearCanvas(this.ctx);
        this.clearCanvas(this.ctx_hover);
        this.prepareCanvas(this.canvas, this.ctx);
        this.prepareCanvas(this.canvas_hover, this.ctx_hover);
        this.drawMap(this.getCountries(), this.ctx);
        console.timeEnd("drawAll");
    };

//working with data
    this.getCountryByProperty = function(property, value) {
        var countries = this.getCountries();
        for (var i in countries) {
            if (countries[i].properties[property] == value) {
                countries[i].geoindex = i;
                return countries[i];
            }
        }
        return false;
    };

    this.getCountryByProperty = function (property, value) {
        var countries = this.getCountries();
        for (var i in countries) {
            if (countries[i].properties[property] == value) {
                countries[i].geoindex = i;
                return countries[i];
            }
        }
        return false;
    };

    this.findCountry = function(name) {
        var country,
            properties = ["brk_name", "formal_en", "geounit", "name_sort", "sovereignt", "subunit", "NAME_1"];
        for (var i in properties) {
            country = this.getCountryByProperty(properties[i], name);
            if (country !== false) {
                return country;
            }
        }
        return false;
    };

    this.getCountryInfo = function(i) {
        return (!isset(this.statistics[i])) ? {} : this.statistics[i];
    };

    this.updateCountryInfo = function(country, property, value) {
        var i = country.geoindex;
        if (!isset(this.statistics[i]))
            this.statistics[i] = {};
        this.statistics[i][property] = value;
    };

    this.updateExampleInfo = function(data) {
        for (var i in data) {
            var country = this.findCountry(data[i].country);
            if (country !== false) {
                this.updateCountryInfo(country, "logins", {value: data[i].value, color: getColor(data[i].value)});
                this.updateCountryInfo(country, "dataindex", i);
                this.updateCountryInfo(country, "tooltip", data[i].tooltip);
            }
        }
    };
//end working with data


//events
    this.checkCountry = function(e) {
        //+ Jonas Raoni Soares Silva
        //@ http://jsfromhell.com/math/is-point-in-poly [rev. #0]
        //@ edited by skype:slavik_ok7
        function isPointInPoly(poly, pt){
            for (var c = false, i = -1, l = poly.length, j = l - 1; ++i < l; j = i)
                ((poly[i][1] <= pt.y && pt.y < poly[j][1]) || (poly[j][1] <= pt.y && pt.y < poly[i][1]))
                && (pt.x < (poly[j][0] - poly[i][0]) * (pt.y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0])
                && (c = !c);
            return c;
        }

        var point = this.getMapPos(e),
            countries = this.getCountries(),
            texts = [],
            tooltip_point = point;
        this.clearCanvas(this.ctx_hover);

        if (this.settings.translate_horizontal && point.x > this.bbox[2]) {
            tooltip_point = JSON.parse(JSON.stringify(point));
            point.x = -this.bbox[2] + point.x + this.bbox[0];
        }

        for (var j in countries) {
            var geometry = this.getGeometry(countries[j]),
                poly = this.getCoords(geometry);
            for (var i in poly) {
                if (isPointInPoly(poly[i], point)) {
                    console.log(j);
                    this.ctx_hover.fillStyle = this.getCanvasStyles().country_hover.fill;
                    this.drawCountry(countries[j], this.ctx_hover);
                    texts.push(this.getCountryName(countries[j]));
                    var info = this.getCountryInfo(j);
                    if (typeof info != "undefined")
                        for (var l in info.tooltip)
                            texts.push(info.tooltip[l]);
                }
            }
        }

        this.drawTooltip(this.ctx_hover, texts, tooltip_point);
    };

    this.mouseMove = function(e){
        if (self.pressed && self.current_zoom != 1) {
            var point = self.getMapPos(e, false, self.map_container);
            var move = {x: point.x - self.start_position.x, y: point.y - self.start_position.y};
            self.end_position = move;
            self.setCssStyleBoth("left", move.x, true);
            self.setCssStyleBoth("top", move.y, true);
            return;
        }
        self.checkCountry(e);
    };

    this.mouseDown = function(e) {
        self.pressed = true;
        self.canvas.className = "moving";
        self.canvas_hover.className = "moving";
        self.start_position = self.getMapPos(e, false, self.map_container);
        self.end_position = {x: 0, y: 0};
    };

//not event
    this.zoomCanvas = function(canvas, zoom, parent, point) {
        if (!isset(parent))
            parent = false;
        var size;
        if (!parent) {
            size = this.getCssSize(canvas);
            size.width *= zoom;
            size.height *= zoom;
            if (zoom > 1) {
                size.left -= point.x * (zoom - 1);
                size.top -= point.y * (zoom - 1);
            } else {
                size.left +=  point.x  * (1 - zoom);
                size.top += point.y * (1 - zoom);
            }
        } else {
            size = this.getCssSize(this.map_container);
            size.left = size.top = 0;
        }
        this.setCssSize(canvas, size);
    };

    this.zoomHandler = function(e) {
        e.preventDefault();
        var delta = Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail))),
            zoom = (delta > 0) ? self.settings.zoom_step : 1 / self.settings.zoom_step;
        if (self.current_zoom * zoom < 1
            || self.current_zoom * zoom >= self.settings.max_zoom
            || self.current_zoom == 1 && zoom < 0)
            return;
        var now = Date.now();
        if (now - self.last_zoom <= 500) {

            return;
        }
        self.last_zoom = now;
        var point = self.getMapPos(e, true),
            focus = self.getMapPos(e, false);
        self.current_zoom *= zoom;
        var parent = (self.current_zoom == 1);
        self.mouseMove(e);
        self.zoomCanvas(self.canvas, zoom, parent, focus);
        self.zoomCanvas(self.canvas_hover, zoom, parent, focus);
    };

    this.resizeHandler = function() {
        var size = self.getCssSize(self.map_container),
            k = size.width / self.field.width;
        self.scale = self.settings.max_zoom * k * window.devicePixelRatio;
        setCssStyle(self.map_container, "height", self.field.height * k);
        self.zoomCanvas(self.canvas, 1, true);
        self.zoomCanvas(self.canvas_hover, 1, true);
        self.drawAll();
    };

    this.translateHorizontal = function() {
        var countries = this.getCountries();
        for (var i in countries) {
            var geometry = this.getGeometry(countries[i]);
            var coords = this.getCoords(geometry);
            for (var j in coords)
                for (var k in coords[j]) {
                    var x = coords[j][k][0];
                    if (x < 0)
                        this.tx1 = Math.max(this.tx1, x - this.bbox[0] + this.bbox[2]);
                    else
                        this.tx0 = Math.min(this.tx0, x);
                }
        }
        return {width: this.tx1 - this.tx0, height: this.bbox[3] - this.bbox[1]}
    };

    this.initialize = function(data) {
        console.info(data);
        self.geodata = data;
        self.bbox = data.bbox;
        if (self.settings.translate_horizontal) {
            self.tx0 = self.bbox[2];
            self.tx1 = 0;
            self.field = self.translateHorizontal();
        } else {
            self.tx0 = self.bbox[0];
            self.tx1 = self.bbox[2];
            self.field.width = self.bbox[2] - self.bbox[0];
            self.field.height = self.bbox[3] - self.bbox[1];
        }
        this.scale *= window.devicePixelRatio;
        self.map_container.className = "";
        self.resizeHandler();
        self.canvas_hover.addEventListener("mousemove", self.mouseMove);
        self.map_container.addEventListener("mousewheel", self.zoomHandler);
        self.map_container.addEventListener("mousedown", self.mouseDown);
        self.map_container.addEventListener("mouseup", self.disable_moving);
        self.map_container.addEventListener("mouseout", self.disable_moving);
        window.addEventListener("resize", self.resizeHandler);
        this.initialized = true;
    };

    this.dataLoaded = function(data, afterLoaded) {
        if (!self.initialized)
            self.initialize(data);
        if (typeof afterLoaded === "function")
            afterLoaded(data);
    };
//end events

    this.loadData = function(file, afterLoaded) {
        if (window.jQuery) {
            (jQuery).ajaxSetup({async: false});
            (jQuery).getJSON(file, function (data) {
                self.dataLoaded(data, afterLoaded);
            });
        }
        else if (typeof file == "object")
            self.dataLoaded(file, afterLoaded);
        else
            //if you want rewrite function, recommend do it here
            console.error("sorry, but i can't load data without jQuery, so you can",
                    "1) include jquery,",
                    "2) rewrite function 'loadData' " +
                    "3) or pass geojson in params with param name 'world_filename'"
            );
    };

    this.addData = function(file) {
        this.loadData(file, function(data){
            for (var i in data.features)
                self.geodata.features.push(data.features[i]);
            self.drawAll();
        });
    };

    this.loadInfo = function(file) {
        file = isset(file) ? file : this.settings.example_filename;
        if (file)
            this.loadData(file, function(data) {
               self.updateExampleInfo(data);
               self.drawAll();
            });
    };

    this.loadData(this.settings.world_filename, function(){
        self.loadInfo(self.settings.example_filename);
    });


};