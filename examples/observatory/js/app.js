/**
 * The observatory, built with the framework-free package and no build step.
 *
 * Deliberately the same dataset, layout and interactions as the React version,
 * so the two can be read side by side to see what the facade gives you in each
 * ecosystem. `new BharatChoropleth(...)` is the whole map; everything else here
 * is ordinary DOM.
 */
(function () {
  "use strict";

  var DATA_BASE = "/data/generated";
  var EDITIONS = {
    historical: { states: DATA_BASE + "/census-2011/states.topo.json", districts: DATA_BASE + "/census-2011/districts" },
    current: { states: DATA_BASE + "/current-2019-states/states.topo.json", districts: DATA_BASE + "/current-2019-districts/districts" },
  };
  var RAMP = ["#e6f2f0", "#c2e2dc", "#95cec4", "#63b5a8", "#3a988b", "#1e786d", "#0b5750"];
  var RAMP_INVERSE = RAMP.slice().reverse();

  var dataset = null;
  var indicator = null;
  var map = null;
  var stateNames = new Map();
  var selectedId = null;

  function format(value) {
    return value === null || value === undefined ? "No data" : value.toFixed(indicator.decimals) + indicator.unit;
  }

  /** Ranked best-first, honouring whether low or high is the good end. */
  function ranked() {
    var rows = Object.keys(indicator.values.state)
      .filter(function (id) { return indicator.values.state[id] !== null; })
      .map(function (id) { return { id: id, value: indicator.values.state[id] }; });
    rows.sort(function (a, b) { return indicator.lowerIsBetter ? a.value - b.value : b.value - a.value; });
    return rows;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderIndicators() {
    var host = document.getElementById("indicators");
    host.textContent = "";
    dataset.indicators.forEach(function (entry) {
      var button = el("button", entry.key === indicator.key ? "is-active" : null, entry.short);
      button.type = "button";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(entry.key === indicator.key));
      button.addEventListener("click", function () { select(entry.key); });
      host.appendChild(button);
    });
  }

  function renderKpis() {
    var board = ranked();
    var values = Object.keys(indicator.values.state);
    var best = board[0];
    var median = board.length ? board[Math.floor(board.length / 2)].value : null;
    var cards = [
      ["Reporting", board.length + " / " + values.length, "states & UTs with a value"],
      [indicator.lowerIsBetter ? "Lowest" : "Highest", best ? (stateNames.get(best.id) || best.id) : "—", best ? format(best.value) : ""],
      ["Median", format(median), "across reporting regions"],
      ["Boundaries", dataset.editions[indicator.edition].label.replace(" boundaries", ""),
        indicator.source.vintage + " data · " + (indicator.levels.indexOf("district") >= 0 ? "state and district" : "state level only")],
    ];
    var host = document.getElementById("kpis");
    host.textContent = "";
    cards.forEach(function (card) {
      var article = el("article");
      article.appendChild(el("span", null, card[0]));
      article.appendChild(el("strong", null, card[1]));
      article.appendChild(el("small", null, card[2]));
      host.appendChild(article);
    });
  }

  function renderProvenance() {
    var source = indicator.source;
    var rows = [
      ["Publisher", source.publisher],
      ["Release", source.title],
      ["Vintage", source.vintage],
      ["Boundaries", dataset.editions[indicator.edition].label],
      ["Join", source.joinRule],
    ];
    if (source.formula) rows.push(["Formula", source.formula]);
    rows.push(["Source file", source.sha256]);

    var body = document.getElementById("provenance-body");
    body.textContent = "";
    rows.forEach(function (row) {
      var wrap = el("div");
      wrap.appendChild(el("dt", null, row[0]));
      var dd = el("dd");
      if (row[0] === "Source file") { var code = el("code", "sha", row[1]); dd.appendChild(code); }
      else dd.textContent = row[1];
      wrap.appendChild(dd);
      body.appendChild(wrap);
    });

    var caveat = document.getElementById("provenance-caveat");
    caveat.textContent = source.caveat || "";
    caveat.hidden = !source.caveat;
    document.getElementById("provenance-link").href = source.url;
  }

  function renderBoard() {
    var board = ranked();
    document.getElementById("board-title").textContent =
      (indicator.lowerIsBetter ? "Best performing" : "Highest") + " states";
    var host = document.getElementById("board");
    host.textContent = "";
    board.slice(0, 10).forEach(function (row, index) {
      var button = el("button", row.id === selectedId ? "is-selected" : null);
      button.type = "button";
      button.appendChild(el("span", "place", String(index + 1)));
      button.appendChild(el("span", "who", stateNames.get(row.id) || row.id));
      button.appendChild(el("span", "num", format(row.value)));
      button.addEventListener("click", function () {
        selectedId = row.id;
        map.select(row.id);
        renderBoard();
      });
      var item = el("li");
      item.appendChild(button);
      host.appendChild(item);
    });
  }

  function renderDetail(context) {
    var host = document.getElementById("rail-detail");
    host.textContent = "";
    if (!context) {
      host.appendChild(el("p", "rail-empty", "Hover, or Tab to a region, for its value and rank."));
      return;
    }
    host.appendChild(el("p", "rail-label", context.label));
    host.appendChild(el("p", "rail-value", format(context.value)));
    var list = el("dl");
    [
      ["Rank in view", context.rank === null ? "—" : "#" + context.rank + " of " + context.rankedCount],
      ["Level", context.level],
    ].forEach(function (row) {
      var wrap = el("div");
      wrap.appendChild(el("dt", null, row[0]));
      wrap.appendChild(el("dd", null, row[1]));
      list.appendChild(wrap);
    });
    host.appendChild(list);
  }

  function select(key) {
    var next = dataset.indicators.filter(function (entry) { return entry.key === key; })[0];
    var editionChanged = !indicator || next.edition !== indicator.edition;
    indicator = next;
    selectedId = null;

    document.getElementById("indicator-label").textContent = indicator.label;
    document.getElementById("indicator-description").textContent = indicator.description;
    document.getElementById("indicator-hint").textContent =
      (indicator.levels.indexOf("district") >= 0 ? "Click a state to drill in" : "State level only") +
      " · click a legend swatch to filter";

    renderIndicators();
    renderProvenance();

    // A different vintage is a different map, so the whole instance is rebuilt.
    // Within one edition the values are swapped in place instead.
    if (editionChanged || !map) mount();
    else {
      map.setValues(indicator.values.state);
      map.colorScale = indicator.lowerIsBetter ? RAMP_INVERSE : RAMP;
      renderKpis();
      renderBoard();
      renderDetail(null);
    }
  }

  function mount() {
    if (map) map.destroy();
    var edition = EDITIONS[indicator.edition];
    var hasDistricts = indicator.levels.indexOf("district") >= 0;
    var districtValues = indicator.values.district || {};

    map = new BharatChoropleth("#map", {
      geometry: fetch(edition.states).then(function (response) { return response.json(); }),
      values: indicator.values.state,
      colorScale: indicator.lowerIsBetter ? RAMP_INVERSE : RAMP,
      legendLabels: indicator.lowerIsBetter ? ["Better", "Worse"] : ["Lower", "Higher"],
      formatValue: function (value) { return value.toFixed(indicator.decimals) + indicator.unit; },
      ariaLabel: indicator.label + " by state and union territory",
      districts: hasDistricts,
      subDistricts: false,
      showLegend: true,
      showBreadcrumb: true,
      loadDistricts: hasDistricts
        ? function (stateId) {
            return fetch(edition.districts + "/" + stateId + ".topo.json")
              .then(function (response) {
                if (!response.ok) throw new Error("No district geometry for " + stateId);
                return response.json();
              })
              .then(function (topology) {
                return {
                  geometry: { topology: topology, object: "districts" },
                  getId: function (feature) { return String(feature.properties.id); },
                  getLabel: function (feature) { return String(feature.properties.name); },
                  getValue: function (feature) {
                    var value = districtValues[String(feature.properties.id)];
                    return value === undefined ? null : value;
                  },
                };
              });
          }
        : undefined,
      onInsight: renderDetail,
      onSelectedChange: function (region) {
        selectedId = region ? region.id : null;
        renderBoard();
      },
      onReady: function () {
        var features = map.getValues();
        stateNames = new Map(Object.keys(features).map(function (name) { return [name, name]; }));
        // getValues() is keyed by display name, so pair ids back to labels via
        // the engine's own regions for the leaderboard.
        stateNames = new Map();
        Object.keys(indicator.values.state).forEach(function (id) { stateNames.set(id, id); });
        var engine = map.engine;
        if (engine) {
          var region = engine.getSelected();
          if (region) selectedId = region.id;
        }
        hydrateNames(edition.states).then(function () {
          renderKpis();
          renderBoard();
        });
      },
    });
  }

  /** Display names for the leaderboard, read straight from the boundary file. */
  function hydrateNames(url) {
    return fetch(url)
      .then(function (response) { return response.json(); })
      .then(function (topology) {
        var object = topology.objects.states;
        stateNames = new Map(
          object.geometries.map(function (geometry) { return [geometry.properties.id, geometry.properties.name]; }),
        );
      })
      .catch(function () { /* leaderboard falls back to ids */ });
  }

  fetch("../data/india-observatory.json")
    .then(function (response) { return response.json(); })
    .then(function (loaded) {
      dataset = loaded;
      select(dataset.indicators[0].key);
    })
    .catch(function (error) {
      document.getElementById("map").textContent = "Could not load the dataset: " + error.message;
    });
})();
