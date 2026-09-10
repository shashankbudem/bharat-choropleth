import type { GeometrySource, MapFeature } from 'bharat-choropleth';
import { feature } from 'topojson-client';

/**
 * Every region name in a layer's geometry.
 *
 * The package hands loaders either GeoJSON or a TopoJSON pair, so both shapes
 * are unpacked here rather than at each call site.
 */
export function asFeatureNames(geometry: GeometrySource, nameOf: (f: MapFeature) => string): string[] {
  const collection =
    'type' in geometry && geometry.type === 'FeatureCollection'
      ? geometry
      : (feature(
          (geometry as { topology: Parameters<typeof feature>[0] }).topology,
          (geometry as { topology: unknown; object: Parameters<typeof feature>[1] }).object
        ) as { features?: MapFeature[] });

  return (collection.features ?? []).map(nameOf);
}
