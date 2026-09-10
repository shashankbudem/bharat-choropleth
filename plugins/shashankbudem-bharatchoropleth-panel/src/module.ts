import { PanelPlugin } from '@grafana/data';
import { BharatOptions } from './types';
import { BharatPanel } from './components/BharatPanel';
import { PALETTE_OPTIONS } from './palettes';

export const plugin = new PanelPlugin<BharatOptions>(BharatPanel).setPanelOptions((builder) =>
  builder
    .addFieldNamePicker({
      path: 'regionField',
      name: 'Region field',
      description: 'State or UT name, slug or LGD id. Defaults to the first string field.',
      settings: { filter: (field) => field.type === 'string' },
    })
    .addFieldNamePicker({
      path: 'districtField',
      name: 'District field',
      description:
        'Optional. Rows carrying a district name become district values under their state; rows leaving it empty are the state value.',
      settings: { filter: (field) => field.type === 'string' },
    })
    .addFieldNamePicker({
      path: 'subDistrictField',
      name: 'Sub-district field',
      description:
        'Optional. Rows carrying a tehsil / taluk / mandal name become values at the third level, under their district.',
      settings: { filter: (field) => field.type === 'string' },
    })
    .addFieldNamePicker({
      path: 'valueField',
      name: 'Value field',
      description: 'The number to colour by. Defaults to the first numeric field.',
      settings: { filter: (field) => field.type === 'number' },
    })
    .addBooleanSwitch({
      path: 'drillDown',
      name: 'Drill down',
      description: 'Click a state for its districts, then a district for its sub-districts.',
      defaultValue: true,
    })
    .addTextInput({
      path: 'drillDownVariable',
      name: 'Set dashboard variable',
      description:
        'Dashboard variable to write the clicked region into, without the var- prefix. Leave empty to disable. Other panels bound to it will follow the click.',
      defaultValue: '',
      settings: { placeholder: 'state' },
    })
    .addSelect({
      path: 'palette',
      name: 'Colour scheme',
      description: 'A sequential ramp, light to dark. One hue, so the shade reads as magnitude.',
      defaultValue: 'teal',
      settings: { options: PALETTE_OPTIONS },
      category: ['Appearance'],
    })
    .addRadio({
      path: 'scaleMode',
      name: 'Colour scale',
      description:
        'Relative stretches the ramp across whatever is on screen, so shades re-scale as you drill. Fixed bands pin each shade to a number, so a colour means the same thing every time.',
      defaultValue: 'relative',
      settings: {
        options: [
          { value: 'relative', label: 'Relative' },
          { value: 'thresholds', label: 'Fixed bands' },
        ],
      },
      category: ['Appearance'],
    })
    .addTextInput({
      path: 'thresholds',
      name: 'Band edges',
      description:
        'Ascending numbers, comma separated — 25, 50, 100, 200 gives five bands. Left empty the scale stays relative.',
      defaultValue: '',
      settings: { placeholder: '25, 50, 100, 200' },
      showIf: (config) => config.scaleMode === 'thresholds',
      category: ['Appearance'],
    })
    .addTextInput({
      path: 'districtThresholds',
      name: 'District band edges',
      description:
        'Districts of one state run far lower than state totals, so they usually need their own edges. Empty reuses the state edges.',
      defaultValue: '',
      settings: { placeholder: 'reuses the state edges' },
      showIf: (config) => config.scaleMode === 'thresholds',
      category: ['Appearance'],
    })
    .addTextInput({
      path: 'subDistrictThresholds',
      name: 'Sub-district band edges',
      description: 'Empty reuses the district edges.',
      defaultValue: '',
      settings: { placeholder: 'reuses the district edges' },
      showIf: (config) => config.scaleMode === 'thresholds',
      category: ['Appearance'],
    })
    .addColorPicker({
      path: 'borderColor',
      name: 'Border colour',
      description: 'Region borders at every level — states, districts and sub-districts.',
      defaultValue: '#FFFFFF',
      category: ['Appearance'],
    })
    .addColorPicker({
      path: 'labelColor',
      name: 'Label colour',
      description:
        'Value labels and tooltip text. Defaults to the theme text colour, so it stays readable in both light and dark. Pick a fixed colour to override.',
      defaultValue: 'text',
      category: ['Appearance'],
    })
    .addSliderInput({
      path: 'borderWidth',
      name: 'Border width',
      description: 'Screen pixels. Non-scaling, so it holds as the panel resizes.',
      defaultValue: 2.5,
      settings: { min: 0, max: 6, step: 0.5 },
      category: ['Appearance'],
    })
    .addSliderInput({
      path: 'labelSize',
      name: 'Label size',
      description:
        'Pixel size of the on-map values, applied at every level. The renderer otherwise shrinks district and sub-district labels.',
      defaultValue: 11,
      settings: { min: 7, max: 20, step: 1 },
      showIf: (config) => config.showValues,
      category: ['Appearance'],
    })
    .addBooleanSwitch({
      path: 'showLegend',
      name: 'Show legend',
      description: 'The legend also filters: pick a band and the rest dims.',
      defaultValue: true,
      category: ['Appearance'],
    })
    .addBooleanSwitch({
      path: 'showValues',
      name: 'Show values on map',
      description: 'Print each region’s value at its centroid.',
      defaultValue: false,
      category: ['Appearance'],
    })
    .addTextInput({
      path: 'aliases',
      name: 'Aliases',
      description:
        'Renames for districts and sub-districts whose name in your data differs from the boundary bundle, one "from = to" per line. Names are never matched by similarity, so a rename has to be stated.',
      defaultValue: '',
      settings: { useTextarea: true, rows: 4, placeholder: 'Bangalore = Bengaluru Urban' },
      category: ['Boundary data'],
    })
    .addTextInput({
      path: 'dataBaseUrl',
      name: 'Boundary data base URL',
      description:
        'Where the boundary bundles are fetched from. Leave empty for the public CDN; point at your own copy of data/generated for an air-gapped Grafana.',
      defaultValue: '',
      settings: { placeholder: 'https://cdn.jsdelivr.net/gh/... (default)' },
      category: ['Boundary data'],
    })
);
