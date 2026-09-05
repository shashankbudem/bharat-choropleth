/**
 * Live temperature, drilled to sub-district.
 *
 * The other observatory cases stop at district because their sources do: a
 * published statistic is collected on particular administrative units, and
 * putting a 2011 figure on a 2019 outline would misstate which places were
 * measured. A weather API has no such vintage — it answers for a coordinate,
 * now — so every level of the current bundle can be filled honestly, including
 * the 5,950 sub-districts.
 *
 * What is being shown, precisely: the temperature at one representative point
 * inside each region, not an average over its area. A large district is one
 * reading, the same as a small one. That is stated on the page, because a
 * choropleth invites you to read it as an area measure and this is not one.
 *
 * One request per view — 36 states, at most 75 districts in a state, at most 38
 * sub-districts in a district — because Open-Meteo takes comma-separated
 * coordinates and answers in the same order.
 */
(function () {
  "use strict";

  var DATA_BASE = "/data/generated";
  var STATES_URL = DATA_BASE + "/current-2019-states/states.topo.json";
  var API = "https://api.open-meteo.com/v1/forecast";

  // Cool to hot. Not a sequential "more is better" ramp: temperature has no good
  // end, and reading it as one is the mistake this palette avoids.
  var RAMP = ["#4a6fa5", "#6d95bd", "#9dbdd4", "#e8e2d0", "#efc48a", "#e09453", "#c2542f"];

  var map = null;
  var centroids = null;
  var names = {};
  var showValues = true;
  var selectedId = null;
  var observedAt = null;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function format(value) {
    return value === null || value === undefined ? "No data" : value.toFixed(1) + "°C";
  }

  /**
   * Temperatures for a set of region ids, in one request.
   *
   * Regions with no centroid — none today, but the file records its own coverage
   * — are asked about at all, so the caller still gets a null for them rather
   * than a silently shifted answer.
   */
  function temperaturesFor(ids, level) {
    var lookup = centroids.centroids[level] || {};
    var known = ids.filter(function (id) { return lookup[id]; });
    if (known.length === 0) return Promise.resolve({});

    var lats = known.map(function (id) { return lookup[id][0]; }).join(",");
    var lons = known.map(function (id) { return lookup[id][1]; }).join(",");
    var url = API + "?latitude=" + lats + "&longitude=" + lons + "&current=temperature_2m";

    return fetch(url)
      .then(function (response) {
        if (!response.ok) throw new Error("Open-Meteo responded " + response.status);
        return response.json();
      })
      .then(function (payload) {
        // One coordinate comes back as an object, several as an array.
        var entries = Array.isArray(payload) ? payload : [payload];
        var values = {};
        known.forEach(function (id, index) {
          var entry = entries[index];
          var reading = entry && entry.current ? entry.current.temperature_2m : null;
          values[id] = typeof reading === "number" ? reading : null;
          if (entry && entry.current && entry.current.time) observedAt = entry.current.time;
        });
        return values;
      });
  }

  function setStatus(text, isError) {
    var host = document.getElementById("status");
    host.textContent = text;
    host.className = isError ? "status is-error" : "status";
  }

  function renderMeta(level, count) {
    var host = document.getElementById("meta");
    host.textContent = "";
    var rows = [
      ["Level", level],
      ["Regions sampled", String(count)],
      ["Observation time", observedAt ? observedAt.replace("T", " ") + " UTC" : "—"],
    ];
    rows.forEach(function (row) {
      var wrap = el("div");
      wrap.appendChild(el("dt", null, row[0]));
      wrap.appendChild(el("dd", null, row[1]));
      host.appendChild(wrap);
    });
  }

  function renderDetail(context) {
    var host = document.getElementById("rail-detail");
    host.textContent = "";
    if (!context) {
      host.appendChild(el("p", "rail-empty", "Hover, or Tab to a region, for its reading and rank."));
      return;
    }
    host.appendChild(el("p", "rail-label", context.label));
    host.appendChild(el("p", "rail-value", format(context.value)));
    var list = el("dl");
    [
      ["Warmest rank", context.rank === null ? "—" : "#" + context.rank + " of " + context.rankedCount],
      ["Level", context.level],
    ].forEach(function (row) {
      var wrap = el("div");
      wrap.appendChild(el("dt", null, row[0]));
      wrap.appendChild(el("dd", null, row[1]));
      list.appendChild(wrap);
    });
    host.appendChild(list);
  }

  /** Geometry plus a live reading for every region in it. */
  function layerFor(url, object, level) {
    return fetch(url)
      .then(function (response) {
        if (!response.ok) throw new Error("No geometry at " + url);
        return response.json();
      })
      .then(function (topology) {
        var geometries = topology.objects[object].geometries;
        var ids = geometries.map(function (geometry) { return geometry.properties.id; });
        geometries.forEach(function (geometry) { names[geometry.properties.id] = geometry.properties.name; });
        return temperaturesFor(ids, level).then(function (values) {
          renderMeta(level, Object.keys(values).length);
          return {
            geometry: { topology: topology, object: object },
            getId: function (feature) { return String(feature.properties.id); },
            getLabel: function (feature) { return String(feature.properties.name); },
            getValue: function (feature) {
              var value = values[String(feature.properties.id)];
              return value === undefined ? null : value;
            },
          };
        });
      });
  }

  function start() {
    setStatus("Reading the current temperature at every state…");
    Promise.all([
      fetch("/data/region-centroids.json").then(function (r) { return r.json(); }),
      fetch(STATES_URL).then(function (r) { return r.json(); }),
    ])
      .then(function (loaded) {
        centroids = loaded[0];
        var topology = loaded[1];
        var geometries = topology.objects.states.geometries;
        var ids = geometries.map(function (g) { return g.properties.id; });
        geometries.forEach(function (g) { names[g.properties.id] = g.properties.name; });
        document.getElementById("coverage").textContent =
          centroids.counts.states + " states · " + centroids.counts.districts + " districts · " +
          centroids.counts.subdistricts + " sub-districts have a sampling point";

        return temperaturesFor(ids, "states").then(function (values) {
          renderMeta("state", Object.keys(values).length);
          mount(topology, values);
          setStatus("Live from Open-Meteo · click a state, then a district, to sample the level below");
        });
      })
      .catch(function (error) {
        setStatus("Could not load live data: " + error.message, true);
      });
  }

  function mount(topology, stateValues) {
    map = new BharatChoropleth("#map", {
      geometry: { topology: topology, object: "states" },
      values: stateValues,
      colorScale: RAMP,
      legendLabels: ["Cooler", "Warmer"],
      formatValue: function (value) { return value.toFixed(1) + "°C"; },
      ariaLabel: "Current temperature by region",
      showLegend: true,
      showBreadcrumb: true,
      showRegionValues: showValues,
      // Own geometry, so the default loaders are off and both levels are wired
      // explicitly — each one fetches its boundaries and then one batch of
      // readings for exactly the regions it just loaded.
      districts: true,
      loadDistricts: function (stateId) {
        setStatus("Sampling districts…");
        return layerFor(DATA_BASE + "/current-2019-districts/districts/" + stateId + ".topo.json", "districts", "districts")
          .then(function (layer) {
            setStatus("Live from Open-Meteo · click a district to sample its sub-districts");
            return layer;
          });
      },
      subDistricts: true,
      loadSubDistricts: function (districtId) {
        setStatus("Sampling sub-districts…");
        return fetch(DATA_BASE + "/current-2019-subdistricts/subdistricts/" + districtId + ".topo.json")
          .then(function (response) {
            // Three of the 788 districts have no sub-district level at all.
            if (response.status === 404) return null;
            if (!response.ok) throw new Error("Sub-districts responded " + response.status);
            return layerFor(
              DATA_BASE + "/current-2019-subdistricts/subdistricts/" + districtId + ".topo.json",
              "subdistricts",
              "subdistricts",
            );
          })
          .then(function (layer) {
            setStatus(
              layer
                ? "Live from Open-Meteo · sub-district level"
                : "This district has no sub-district level in the bundle",
            );
            return layer;
          });
      },
      onInsight: renderDetail,
      onSelectedChange: function (region) { selectedId = region ? region.id : null; },
    });
  }

  document.getElementById("show-values").addEventListener("change", function (event) {
    showValues = event.target.checked;
    if (map && map.engine) map.engine.update({ showRegionValues: showValues });
  });

  document.getElementById("refresh").addEventListener("click", function () {
    if (map) map.destroy();
    map = null;
    start();
  });

  start();
})();
