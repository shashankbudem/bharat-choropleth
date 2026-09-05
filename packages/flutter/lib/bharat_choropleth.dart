/// Accessible India state and district choropleth maps for Flutter.
///
/// Boundary geometry is never bundled — decode your own TopoJSON with
/// [decodeTopoJson] and hand the features to [IndiaChoropleth], the same way the
/// JavaScript and React packages in this repository work.
library;

export 'src/color_scale.dart' show ColorScale, kDefaultColorScale, kEmptyColor;
export 'src/legend.dart' show LegendBucket, legendBucketLabel, legendBuckets, swatchIndexOf;
export 'src/chrome.dart' show ChoroplethBreadcrumb, ChoroplethLegend, ChoroplethTooltip, ordinal;
export 'src/india_choropleth.dart' show IndiaChoropleth;
export 'src/model.dart'
    show
        ChoroplethInsight,
        ChoroplethLayer,
        ChoroplethLevel,
        ChoroplethReferenceRegion,
        ChoroplethRegion,
        ReferenceOverlay,
        ReferenceOverlayFill,
        kChoroplethSurfaceKey;
export 'src/projection.dart'
    show
        MercatorProjection,
        ViewBoxFit,
        boundsOfRing,
        convexHull,
        enlargeSmallParts,
        keepsTrueGeometry,
        kViewBox,
        kViewBoxPadding,
        labelPointFor,
        largestRingExtentOf,
        scatteredHitArea;
export 'src/states.dart' show StateIdentity, kStates, normalizeStateKey, resolveState;
export 'src/tooltip_position.dart' show TooltipPlacement, TooltipSide, placeTooltip;
export 'src/topojson.dart' show MapFeature, TopoJsonException, decodeTopoJson;
