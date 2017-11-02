var srcProj = '+proj=longlat +datum=WGS84 +no_defs';
var dstProj = '+proj=aea +lat_1=29.5 +lat_2=45.5 +lat_0=37.5 +lon_0=-96 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs';

var myMap = null;
var currentPosition = null;
var bounds = null;
var polyline = null;
var pointById = {};
var startAltitude = null;
var stopAltitude = null;
var antennaHeight = null;
var safetyHeight = null;
var safetyDepth = null;
var path = null;

function getCookie(name) {
    var r = document.cookie.match("\\b" + name + "=([^;]*)\\b");
    return r ? r[1] : undefined;
}

function formatDelta(x) {
	if (x > 0) {
		return '+' + x.toFixed(2) + ' M' 
	}
	return x.toFixed(2) + ' M';
}

function pointToPointDistance(x1, y1, x2, y2) {
	  var dx = x2 - x1;
	  var dy = y2 - y1;
	  return Math.sqrt(dx * dx + dy * dy); 
}

function slope3D(x1, y1, z1, x2, y2, z2) {
	  var run = pointToPointDistance(x1, y1, x2, y2);
	  var rise = z2 - z1;  
	  return rise / run; 

}

function pointToSegmentDistance(x, y, x1, y1, x2, y2) {
	  var A = x - x1;
	  var B = y - y1;
	  var C = x2 - x1;
	  var D = y2 - y1;
	  var dot = A * C + B * D;
	  var len_sq = C * C + D * D;
	  var param = -1;
	  if (len_sq != 0) //in case of 0 length line
	      param = dot / len_sq;
	  var xx, yy;
	  if (param < 0) {
	    xx = x1;
	    yy = y1;
	  }
	  else if (param > 1) {
	    xx = x2;
	    yy = y2;
	  }
	  else {
	    xx = x1 + param * C;
	    yy = y1 + param * D;
	  }
	  return pointToPointDistance(xx, yy, x, y);
}

function inverseDistanceWeight(x, y, x1, y1, v1, x2, y2, v2) {
	var d1 = pointToPointDistance(x, y, x1, y1);
	if (d1 === 0) {
		return v1;
	}
	var d2 = pointToPointDistance(x, y, x2, y2);
	if (d2 === 0) {
		return v2;
	}
	var w1 = 1 / d1;
	var w2 = 1 / d2;
	return (w1 * v1 + w2 * v2) / (w1 + w2);
}

function getPolylineDistance(path, point) {
	var minDist = 1000000;
	var slope = 0;
	var altDiff = 0;
	var projCoords = proj4(srcProj, dstProj, [point.lng, point.lat]);
	for (var i=0; i<path.length-1;i++) {
		var c1 = pointById[i];
		var c2 = pointById[i+1];
		var angle = Math.atan2(c2.lng - c1.lng, c2.lat - c1.lat) * 180 / Math.PI;
		if (angle < 0) {
			angle += 360;
		}
		var dist = pointToSegmentDistance(projCoords[0], projCoords[1], c1.lng, c1.lat, c2.lng, c2.lat);
		if (dist < minDist) {
			minDist = dist;
			slope = slope3D(c1.lng, c1.lat, c1.desiredAlt, c2.lng, c2.lat, c2.desiredAlt);
			altDiff = inverseDistanceWeight(projCoords[0], projCoords[1], c1.lng, c1.lat, c1.desiredAlt, c2.lng, c2.lat, c2.desiredAlt);
			altDiff = point.alt - antennaHeight - altDiff;
			angleDif = angle - point.heading;
		}
	}
	return [minDist, slope, altDiff];
}

function initMap() {
	myMap = L.map('mapid').setView([53.58442963725551, -110.51799774169922], 18);
	L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw', {
		maxZoom: 22,
		attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, ' +
			'<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
			'Imagery © <a href="http://mapbox.com">Mapbox</a>',
		id: 'mapbox.streets'
		}).addTo(myMap);
	var latlngs = [];
	var deltaAltitude = (stopAltitude-startAltitude) / (path.length - 1);
	for (var i=0; i<path.length;i++) {
		var coords = path[i].geometry.coordinates;
		var circle = L.circle(new L.LatLng(coords[1], coords[0]), 1).addTo(myMap);
		latlngs.push(new L.LatLng(coords[1], coords[0]));
		projCoords = proj4(srcProj, dstProj, [coords[0], coords[1]]);
		pointById[i] = {'lat': projCoords[1], 'lng': projCoords[0], 'alt': coords[2]};
		pointById[i].desiredAlt = startAltitude + i * deltaAltitude;
		pointById[i].circle = circle;
	}
	polyline = L.polyline(latlngs, {color: 'red'}).addTo(myMap);
	bounds = polyline.getBounds()
	myMap.fitBounds(bounds);
	var popup = L.popup();
	function onMapClick(e) {
		popup
			.setLatLng(e.latlng)
			.setContent("You clicked the map at " + e.latlng.toString())
		.openOn(myMap);
	}
	myMap.on('click', onMapClick);
	myMap.invalidateSize();
	refreshPosition();
}

function refreshPosition() {
	var jqxhr = $.get( "/position").done(function (data) {
		var data = JSON.parse(data);
		try {
			$('#plat').html(data.lat.toFixed(8));
			$('#plng').html(data.lng.toFixed(8));
			$('#pdir').html(data.heading);
			var fix = data.fix;
			if (data.fix === 1) {
				fix = 'single';
				$('#pacc').css('color', 'red');
			} else if (data.fix === 4){
				$('#pacc').css('color', 'green');
				fix = 'fix';
			} else if (data.fix === 5){
				$('#pacc').css('color', '#CCCC00');
				fix = 'float';
			}
			$('#pacc').html(data.acc.toFixed(2) + '/' + fix);
			$('#ptim').html(data.ts);
			var result = getPolylineDistance(path, data);
			var slope = result[1] * 100;
			$('#palt').html(data.alt.toFixed(2) + '/' + slope.toFixed(2) + '%');
			$('#height').html(formatDelta(result[2]));
			$('#distance').html(formatDelta(result[0]));
			$('#ptim').css('color', 'black');
			if (result[2] > 0) {
				$('.fa-arrow-down').css('color', '#5cb85c!important');
				$('.fa-arrow-up').css('color', '#868e96!important');
			}
			else {
				$('.fa-arrow-up').css('color', '#5cb85c!important');
				$('.fa-arrow-down').css('color', '#868e96!important');
			}
			if (data.alt - antennaHeight <= safetyDepth) {
				$('.fa-arrow-down').css('color', '#d9534f!important');
			}
			if (data.alt >= safetyHeight) {
				$('.fa-arrow-up').css('color', '#d9534f!important');
			}
			if (currentPosition === null) {
				currentPosition = L.circle([data.lat, data.lng], data.acc).addTo(myMap);
				bounds = polyline.getBounds();
				bounds.extend(new L.LatLng(data.lat, data.lng));
				myMap.fitBounds(bounds);
			}
			else {
				currentPosition.setLatLng(new L.LatLng(data.lat, data.lng));
				currentPosition.setRadius(data.acc);
			}
		}
		catch (err) {
			$('#ptim').css('color', 'red');
			console.log('cannot parse position data: ' + data + ', error: ' + err.message); 
		}
		setTimeout(refreshPosition, 1000);
	})
	.fail(function() {
		$('#ptim').css('color', 'red');
		console.log('cannot retrieve position data');
		setTimeout(refreshPosition, 5000);
	});
}

$(document).ready(function() {
	startAltitude = parseFloat($('#start_altitude').val());
	stopAltitude = parseFloat($('#stop_altitude').val());
	antennaHeight = parseFloat($('#antenna_height').val());
	safetyHeight = parseFloat($('#safety_height').val());
	safetyDepth = parseFloat($('#safety_depth').val());
	path = JSON.parse($('#path').attr('data-text'))['features'];
	initMap();
});

$(window).on( "load", function() {
	if (myMap !== null) {
		myMap.invalidateSize();
	}
});