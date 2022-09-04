const basePath = '/api/v1';

var baseUrl;
if (window.location.protocol === 'file:') {
  const host = 'cryptomarketdepth.com'; // 'localhost:8000';
  baseUrl = 'http://' + host + basePath;
} else {
  baseUrl = basePath;
}

vega.expressionFunction('financial', function(number, params) {
  var fraction;
  var suffix;

  if (number >= 1e9) {
    fraction = number / 1e9;
    suffix = "bn";
  } else if (number >= 1e6) {
    fraction = number / 1e6;
    suffix = "m";
  } else if (number >= 1e3) {
    fraction = number / 1e3;
    suffix = "k";
  } else {
    fraction = number;
    suffix = "";
  }

  return fraction.toPrecision(parseInt(params)) + " " + suffix;
});

const detailsElem = document.getElementById('details');
const buySellPathsElem = document.getElementById('buy_sell_paths');
const depthChartHeader = document.getElementById('depth_chart_header');
const chartBackgroundColor = "#f2f2f2";

class Config {
  numeraire = 'USD';
  slippage = 0.5;
  crypto = 'all';
  limit = 10;
  toDate = null;
  fromDate = null;
  detailRunId = null;

  constructor(params) {
    this.numeraire = params.get('numeraire') || this.numeraire;
    this.slippage = params.get('slippage') || this.slippage;
    this.crypto = params.get('crypto') || this.crypto;
    this.limit = params.get('limit') || this.limit;
    this.toDate = params.get('to') || this.toDate;
    this.fromDate = params.get('from') || this.fromDate;
    this.detailRunId = params.get('detailRunId') || this.detailRunId;
  }

  static fromWindowHash() {
    return new Config(new URLSearchParams(window.location.hash.substring(1)));
  }

  toUrl() {
    return (new URLSearchParams(this)).toString();
  }

  pathsNumeraireSlippage() {
    return `run/_run_id_/paths/${this.numeraire}/${this.slippage}/%s`;
  }
}

async function locationHashChanged() {
    const hashLoc = window.location.hash.substring(1);
    console.log("locationHashChanged: " + hashLoc);

    // check is "details"
    if (hashLoc.substring(0,2) === "d:") {
      detailsElem.innerHTML = "<img src='images/spinner.gif' width=50 height=50>"
      buySellPathsElem.scrollIntoView();
      const urlParams = hashLoc.substring(2);
      const fetchPromise = fetch(baseUrl + '/' + urlParams);
      // TODO: enable for "detailsElem" here
      const resp = await fetchPromise;
      const detailsJson = await resp.json();
      // TODO: update "detailsElem" with "urlParams"
      detailsElem.className = 'tableFixHead';
      detailsElem.innerHTML = mkDetailsTable(parseDetailsJson(detailsJson));
    } else {
      do_it();
    }
}
window.onhashchange = locationHashChanged;

class PathInfo {
  quantity;
  pathDescr;
  priceLow;
  priceHigh

  constructor(quantity, pathDescr, priceLow, priceHigh) {
    this.quantity = quantity;
    this.pathDescr = pathDescr;
    this.priceLow = priceLow;
    this.priceHigh = priceHigh;
  }
}

function parseDetailsJson(detailsJson) {
  const run = detailsJson[0];
  const data = detailsJson[1][0];
  const calcInfo = data[0];
  const pathList = data[1];
  let toPathDescrFold = (pathObj) =>
      {
        let mkPathStringList = (startCurrency) => pathObj.currencys.reduce(function(state, rightCurrency, i, _) {
          let pathState = state[0];
          let leftCurrency = state[1];
          let venue = pathObj.venues[i];
          let apiUrl = `${baseUrl}/run/${run.id}/book/${venue}/${leftCurrency}/${rightCurrency}`;
          let venueLink = `<a href="javascript:pathVenueClicked('${apiUrl}', '${run.time_start}')">--${venue}--></a>`;
          let newPath = ` ${venueLink} ${rightCurrency}`;
          return [pathState + newPath, rightCurrency]
          },
          [startCurrency, startCurrency]
        );
        let pathStringRes = mkPathStringList(pathObj.start);
        return pathStringRes[0];
      }
      let qtyPath = (pathListElem) =>
      { let pi = pathListElem[0];
        let pathDescr = pathListElem[1];
        return new PathInfo(pi.qty, toPathDescrFold(pathDescr), pi.price_low, pi.price_high);
      }
  return [[calcInfo.currency, calcInfo.numeraire, run.time_start], pathList.map(qtyPath)];
}

function pathVenueClicked(apiUrl, run_time_start) {
  depthChartHeader.scrollIntoView();
  updateDataUrl(apiUrl, run_time_start);
}

function mkDetailsTable (pathInfo) {
  const currency = pathInfo[0][0];
  const numeraire = pathInfo[0][1];
  const timeStart = pathInfo[0][2].replace("T", " ").replace("Z", "");
  const pathList = pathInfo[1];
  const qtySum = pathList.reduce((sum, x) => sum + x.quantity, 0);
  const tableRows =
    pathList.map(qtyPath =>
        `<tr>
          <td>${numberWithCommas(qtyPath.quantity)}</td>
          <td>${qtyPath.pathDescr}</td>
          <td>${numberWithCommas(qtyPath.priceLow.toPrecision(6))}</td>
          <td>${numberWithCommas(qtyPath.priceHigh.toPrecision(6))}</td>
        </tr>`
      ).join("\n");
  return `<table>
      <caption>Table: amount per path for ${currency} (${timeStart} UTC)</caption>
      <thead>
        <tr>
          <th>Amount (${numeraire})</th>
          <th>Path</th>
          <th>Price (low)</th>
          <th>Price (high)</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
      <tfoot>
        <tr>
          <td>${numberWithCommas(qtySum)}</td>
          <td>
            <b>
              <i>Sum</i>
            </b>
          </td>
          <td>—</td>
          <td>—</td>
        </tr>
      </tfoot>
    </table>`;
}

let mkDataUrl = urlParams => baseUrl
      + '/liquidity/' + urlParams.crypto
      + `/${urlParams.numeraire}/${urlParams.slippage}`
      + '?limit=' + urlParams.limit
      + (urlParams.fromDate ? '&from=' + urlParams.fromDate : '')
      + (urlParams.toDate ? "&to=" + urlParams.toDate : '');

function uniq(a) {
    return a.sort().filter(function(item, pos, ary) {
        return !pos || item != ary[pos - 1];
    });
}

function numberWithCommas(x) {
    // source: https://stackoverflow.com/a/2901298/700597
    const integerWithCommas = n => n.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const numSplit = x.toString().split(".");
    const wholePart = numSplit[0];
    const fractionalPart = numSplit[1];
    return integerWithCommas(wholePart) + (fractionalPart ? "." + fractionalPart : "");
}

var calcCountQueue = [];
function movingAverageDiff(size, calcCount, timestamp) {
    calcCountQueue.push([calcCount, timestamp]);
    if (calcCountQueue.length === 1) return null;
    if (calcCountQueue.length > size) calcCountQueue.shift();
    const arrayCopy = calcCountQueue.slice();
    const oldestVal = arrayCopy.shift();
    const newestVal = arrayCopy.pop();
    const countDiff = oldestVal[0] - newestVal[0];
    const timeDiff = newestVal[1] - oldestVal[1];
    return countDiff / (timeDiff / 1000);
}

async function runUpdateCount() {
  let unfinishedCount = document.getElementById('unfinished_count');
  async function updateCounter() {
    const resp = await fetch(baseUrl + '/calc/unfinished/count');
    const time = Date.now();
    const calcCount = await resp.json();
    unfinishedCount.innerHTML = numberWithCommas(calcCount);
    // moving average
    const movingAvgRate = movingAverageDiff(10, calcCount, time);
    const rateText = movingAvgRate ? movingAvgRate.toFixed(1) : '?';
    unfinishedCount.innerHTML = unfinishedCount.innerHTML + ' (' + rateText + ' calc/sec)';
  }
  await updateCounter();
  setInterval(updateCounter, 5000);
}

async function do_it() {
  const urlParams = Config.fromWindowHash();
  createBarChart(urlParams);
  createGraph(urlParams);
  createTimeSeries(urlParams);
}

async function createBarChart(urlParams) {
  const barChartSpec = await mkBarChartSpec(urlParams);
  return vegaEmbed('#bar_chart', barChartSpec).catch(console.error);
}

async function createGraph(urlParams) {
  return vegaEmbed('#graph', mkGraphSpec(urlParams)).then(function(result) {
    // Access the Vega view instance (https://vega.github.io/vega/docs/api/view/) as result.view
  }).catch(console.error);
}

async function createTimeSeries(urlParams) {
  const yAxisLabel = `MM ${urlParams.numeraire} @ ${urlParams.slippage}% slippage`;
  var spec =
  {
    "$schema": "https://vega.github.io/schema/vega-lite/v4.json",
    "background": chartBackgroundColor,
    "data": {
      "name": "time_series",
      "url": mkDataUrl(urlParams),
    },
    "format": {
        "parse": {
          "run.time_start": "time",
          "qty": "number",
          "currency": "string",
          "run_id": "number"
        }
      },
    "width": 700,
    "height": 450,
    "transform": [
      {"filter": "datum.qty != 0"},
      // {"filter": "datum.currency != \"TSD\""},
      // {"filter": "datum.currency != \"UST\""},
      // {"filter": "datum.currency != \"USDC\""},
      // {"filter": "datum.currency != \"USDT\""},
      // {"filter": "datum.currency != \"TUSD\""},
      // {"filter": "datum.currency != \"BTCB\""},
      {"filter": "datum.run_id != 1"},
      {"calculate": "1e-6 * datum.qty", "as": "qty_mm"},
      {"calculate": `'#d:' + replace(replace("${urlParams.pathsNumeraireSlippage()}", "%s", datum.currency), "_run_id_", datum.run_id)`, "as": "url"}
    ],
    "encoding": {
      "x": {
        "field": "run.time_start",
        "type": "temporal",
        "title": "Time"
      },
      "tooltip": [
        {"field": "currency", "title": "Currency", "type": "nominal"},
        { "field": "qty_mm",
          "title": yAxisLabel,
          "type": "quantitative"
        },
        {"field": "run.time_start", "title": "Time", "type": "temporal"},
        {"field": "run_id", "title": "Run ID", "type": "nominal"}
      ],
      "href": {"field": "url"}
    },
    "layer": [
      {
        "encoding": {
          "color": {
            "field": "currency",
            "type": "nominal",
            "title": "Currency",
            "sort": {
              "op": "max",
              "field": "qty_mm",
              "order": "descending"
            }
          },
          "y": {
            "field": "qty_mm",
            "type": "quantitative",
            "title": yAxisLabel,
            "scale": {"type": "log"},
          }
        },
        "layer": [
          {"mark": "line"},
          {"mark": {
            "type": "point",
            "strokeWidth": 0
            }
          },
          {"transform":
            [{"filter": {"selection": "hover"}}],
            "mark": "line"
          }
        ]
      },
      {
        "transform": [{"pivot": "currency", "value": "qty_mm", "groupby": ["run.time_start"]}],
        "mark": "rule",
        "encoding": {
          "opacity": {
            "condition": {"value": 0.3, "selection": "hover"},
            "value": 0
          }
        },
        "selection": {
          "hover": {
            "type": "single",
            "fields": ["run.time_start"],
            "nearest": true,
            "on": "mouseover",
            "empty": "none",
            "clear": "mouseout"
          }
        }
      }
    ]
  }

  return vegaEmbed('#time_series', spec).then(function(result) {
    // Access the Vega view instance (https://vega.github.io/vega/docs/api/view/) as result.view
    result.view.addDataListener('time_series', function(name, value) {
      console.log(name, value);
    });
  }).catch(console.error);
}

function mkGraphSpec(urlParams) {
  var dataUrl = `${baseUrl}/run/newest/paths/${urlParams.numeraire}/${urlParams.slippage}/all?limit=200`;
  var json = {
    "$schema": "https://vega.github.io/schema/vega/v5.json",
    "description": "TODO",
    "background": chartBackgroundColor,
    "width": 850,
    "height": 700,
    "padding": 0,
    "autosize": "none",
    "data": [
      {
        "name": "node-data",
        "url": dataUrl,
        "format": {"type": "json", "property": "nodes"},
        "transform": [
          {
            "type": "formula",
            "as": "shape",
            "expr": "datum.is_crypto ? 'circle' : 'square'"
          },
          {
            "type": "formula",
            "expr": "format(1e-6 * datum.qty, ',.4r') + ' MM USD'",
            "as": "node_tooltip_qty_raw"
          },
          {
            "type": "formula",
            "expr": "datum.is_crypto ? datum.node_tooltip_qty_raw : '-'",
            "as": "node_tooltip_qty"
          },
          {
            "type": "formula",
            "expr": "{'Currency': datum.name, 'Quantity': datum.node_tooltip_qty, 'Market count': datum.market_count, 'Exchanges': join(datum.node_venues, ', ')}",
            "as": "node_tooltip"
          },
          {"type": "formula", "expr": "log(datum.qty)", "as": "qty_log"},
          {"type": "extent", "field": "qty_log", "signal": "qty_extent"},
          {
            "type": "formula",
            "expr": "(datum.qty_log - qty_extent[0] + 1) * nodeSize",
            "as": "node_radius_raw"
          },
          {
            "type": "formula",
            "expr": "datum.is_crypto ? datum.node_radius_raw : qty_extent[1] / 2",
            "as": "node_radius"
          },
          {
            "type": "formula",
            "expr": "datum.is_crypto ? scale('color', datum.name) : 'yellow'",
            "as": "node_color"
          },
          {
            "type": "formula",
            "expr": "datum.is_crypto ? 1 : 0.5",
            "as": "node_opacity"
          }
        ]
      },
      {
        "name": "link-data",
        "url": dataUrl,
        "format": {"type": "json", "property": "links"}
      }
    ],
    "signals": [
      {"name": "cx", "update": "width / 2"},
      {"name": "cy", "update": "height / 2"},
      // if the graph fits within a 500px box, how much should we multiply pixels sizes by
      //  if the box becomes "n" pixels instead?
      {"name": "size_factor", "update": "width / 500"},
      {
        "name": "nodeSize",
        "value": 2,
      },
      {
        "name": "nodeCharge",
        "value": -130
      },
      {
        "name": "linkWidth",
        "value": 7
      },
      {
        "name": "linkLength",
        "value": 80
      },
      {"name": "tooltip", "description": "Show tooltip on hover", "value": true, "bind": {"input": "checkbox"}},
      {"name": "static", "description": "Do not snap back after dragging", "value": false, "bind": {"input": "checkbox"}},
      {
        "description": "State variable for active node fix status.",
        "name": "fix",
        "value": false,
        "on": [
          {
            "events": "symbol:mouseout[!event.buttons], window:mouseup",
            "update": "false"
          },
          {
            "events": "symbol:mouseover",
            "update": "fix || true"
          },
          {
            "events": "[symbol:mousedown, window:mouseup] > window:mousemove!",
            "update": "xy()",
            "force": true
          }
        ]
      },
      {
        "description": "Graph node most recently interacted with.",
        "name": "node",
        "value": null,
        "on": [
          {"events": "symbol:mouseover", "update": "fix === true ? item() : node"}
        ]
      },
      {
        "description": "Flag to restart Force simulation upon data changes.",
        "name": "restart",
        "value": false,
        "on": [{"events": {"signal": "fix"}, "update": "fix && fix.length"}]
      },
      {
        "name": "symbol_hover_index",
        "value": null,
        "on": [
          {"events": "symbol:mouseover", "update": "datum.idx"},
          {"events": "symbol:mouseout", "update": "null"}
        ]
      }
    ],
    "scales": [
      {"name": "color", "type": "ordinal", "range": {"scheme": "category20c"}},
      {
        "name": "edge_size",
        "type": "pow",
        "exponent": 0.3,
        "domain": {"data": "link-data", "field": "size"},
        "range": [1, {"signal": "linkWidth"}]
      }
    ],
    "marks": [
      {
        "name": "nodes",
        "type": "symbol",
        "zindex": 1,
        "from": {"data": "node-data"},
        "on": [
          {
            "trigger": "fix",
            "modify": "node",
            "values": "fix === true ? {fx: node.x, fy: node.y} : {fx: fix[0], fy: fix[1]}"
          },
          {"trigger": "!fix", "modify": "node", "values": "{fx: null, fy: null}"}
        ],
        "encode": {
          "enter": {
            "fill": {"field": "node_color"},
            "fillOpacity": {"field": "node_opacity"},
            "stroke": {"value": "white"}
          },
          "update": {
            "tooltip": {"signal": "tooltip ? datum.node_tooltip : ''"},
            "size": {"signal": "datum.node_radius * datum.node_radius * 4"},
            "shape": {"field": "shape"},
            "cursor": {"value": "pointer"}
          }
        },
        "transform": [
          {
            "type": "force",
            "iterations": 300,
            "restart": {"signal": "restart"},
            "static": {"signal": "static"},
            "signal": "force",
            "forces": [
              {"force": "center", "x": {"signal": "cx"}, "y": {"signal": "cy"}},
              {"force": "collide", "radius": 14},
              {"force": "nbody", "strength": {"signal": "nodeCharge"}},
              {
                "force": "link",
                "links": "link-data",
                "id": "datum.idx",
                "distance": {"signal": "linkLength"}
              }
            ]
          }
        ]
      },
      {
        "type": "text",
        "zindex": 2,
        "from": {"data": "nodes"},
        "interactive": false,
        "encode": {
          "enter": {
            "fill": {"value": "blue"}
          },
          "update": {
            "fontSize": {"value": 10},
            "fontWeight": {"signal": "symbol_hover_index && symbol_hover_index === datum.datum.idx ? 'bold' : 'normal'"},
            "y": {
              "field": "y",
              "offset": {"signal": "datum.datum.node_radius * -1.1"}
            },
            "x": {"field": "x"},
            "text": {"field": "datum.name"},
            "align": {"value": "center"}
          }
        }
      },
      {
        "type": "path",
        "zindex": 0,
        "from": {"data": "link-data"},
        "interactive": false,
        "encode": {
          "update": {
            "stroke": {
              "signal": "symbol_hover_index && (symbol_hover_index === datum.source.datum.idx || symbol_hover_index === datum.target.datum.idx) ? 'red' : 'black'"
            },
            "strokeWidth": {"scale": "edge_size", "field": "size"},
            "strokeOpacity": {
              "signal": "symbol_hover_index && (symbol_hover_index === datum.source.datum.idx || symbol_hover_index === datum.target.datum.idx) ? 0.40 : 0.1"
            },
            "strokeJoin": "round"
          }
        },
        "transform": [
          {
            "type": "linkpath",
            "require": {"signal": "force"},
            "shape": "line",
            "sourceX": "datum.source.x",
            "sourceY": "datum.source.y",
            "targetX": "datum.target.x",
            "targetY": "datum.target.y"
          }
        ]
      }
    ]
  };
  return json;
}

async function mkBarChartSpec(urlParams) {
  const mkDataUrl = (limit) =>
    `${baseUrl}/liquidity/all/newest/${urlParams.numeraire}/${urlParams.slippage}?limit=${limit}`;

  const fetchChartDate = async () => {
    const resp = await fetch(mkDataUrl(1));
    const detailsJson = await resp.json();
    return new Date(detailsJson[0].run.time_start);
  }

  const formatDate = (date) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString("en-US", options);
}

  var chartDateStr;
  try {
    const chartDate = await fetchChartDate();
    chartDateStr = `(${formatDate(chartDate)})`;
  } catch (error) {
    console.error("failed to fetch bar chart date", error);
    chartDateStr = "";
  }

  var json = {
    "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
    "background": chartBackgroundColor,
    "width": 800,
    "height": 450,
    "data": {
      "url": mkDataUrl(15),
      "name": "raw_data"
    },
    "title": `Buy/sell liquidity at ${urlParams.slippage}% slippage ${chartDateStr}`,
    "transform": [
      {"calculate": "[datum.qty_buy, datum.qty_sell]", "as": "qty_type_qty"},
      {"calculate": "['buy', 'sell']", "as": "qty_type"},
      {"flatten": ["qty_type_qty", "qty_type"]},
      {"calculate": "datum.qty_type_qty * 1e-6", "as": "qty_type_qty_mm"},
      {
        "calculate": "format(datum.qty_type_qty_mm, ',.4r') + ' MM USD'",
        "as": "tooltip"
      }
    ],
    "facet": {
      "field": "currency",
      "title": "Currency",
      "type": "nominal",
      "sort": {"op": "sum", "field": "sum_qty_type_qty", "order": "descending"},
      "header": {"orient": "bottom"}
    },
    "spec": {
      "encoding": {
        "y": {
          "aggregate": "sum",
          "field": "qty_type_qty_mm",
          "title": "Quantity (MM USD)",
          "axis": {"grid": false},
          "scale": {"type": "log"}
        },
        "x": {"field": "qty_type", "type": "nominal", "axis": null}
      },
      "layer": [
        {
          "mark": "bar",
          "encoding": {
            "color": {
              "field": "qty_type",
              "title": "Direction",
              "scale": {"range": ["#06d6a0", "#ef476f"]}
            },
            "tooltip": {"field": "tooltip", "type": "ordinal"}
          }
        },
        {
          "mark": {
            "type": "text",
            "dx": -5,
            "angle": 90,
            "baseline": "middle",
            "align": "right"
          },
          "encoding": {
            "text": {
              "aggregate": "sum",
              "field": "qty_type_qty",
              "type": "quantitative",
              "format": "3",
              "formatType": "financial"
            }
          }
        }
      ]
    },
    "config": {
      "view": {"stroke": "transparent"},
      "facet": {"spacing": 10},
      "axis": {"domainWidth": 1},
      "customFormatTypes": true
    }
  };
  return json;
}