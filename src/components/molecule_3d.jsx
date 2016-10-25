import jQuery from 'jquery';
import React from 'react';
import libUtils from '../utils/lib_utils';
import moleculeUtils from '../utils/molecule_utils';
import selectionTypesConstants from '../constants/selection_types_constants';

window.$ = jQuery;
const $3Dmol = require('../vendor/3Dmol');

const DEFAULT_FONT_SIZE = 14;
const ORBITAL_COLOR_POSITIVE = 0xff0000;
const ORBITAL_COLOR_NEGATIVE = 0x0000ff;

class Molecule3d extends React.Component {
  static defaultProps = {
    atomLabelsShown: false,
    backgroundOpacity: 1.0,
    backgroundColor: '#73757c',
    height: '500px',
    orbital: {},
    selectedAtomIds: [],
    selectionType: selectionTypesConstants.ATOM,
    shapes: [],
    styles: {},
    width: '500px',
  }

  static propTypes = {
    atomLabelsShown: React.PropTypes.bool,
    backgroundColor: React.PropTypes.string,
    backgroundOpacity: React.PropTypes.number,
    height: React.PropTypes.string,
    modelData: React.PropTypes.shape({
      atoms: React.PropTypes.array,
      bonds: React.PropTypes.array,
    }).isRequired,
    onChangeSelection: React.PropTypes.func,
    orbital: React.PropTypes.shape({
      cube_file: React.PropTypes.string,
      iso_val: React.PropTypes.number,
      opacity: React.PropTypes.number,
    }),
    selectedAtomIds: React.PropTypes.arrayOf(React.PropTypes.number),
    selectionType: React.PropTypes.oneOf([
      selectionTypesConstants.ATOM,
      selectionTypesConstants.RESIDUE,
      selectionTypesConstants.CHAIN,
    ]),
    shapes: React.PropTypes.arrayOf(React.PropTypes.object),
    styles: React.PropTypes.objectOf(React.PropTypes.object),
    width: React.PropTypes.string,
  }

  constructor(props) {
    super(props);

    this.state = {
      selectedAtomIds: props.selectedAtomIds,
    };
  }

  componentDidMount() {
    this.render3dMol();
  }

  componentWillReceiveProps(nextProps) {
    this.setState({
      selectedAtomIds: nextProps.selectedAtomIds,
    });
  }

  componentDidUpdate() {
    this.render3dMol();
  }

  onClick = (glAtom) => {
    const atoms = this.props.modelData.atoms;
    const atom = atoms[glAtom.serial];
    const selectionType = this.props.selectionType;
    const newSelectedAtomIds = moleculeUtils.addSelection(
      atoms,
      this.state.selectedAtomIds,
      atom,
      selectionType
    );

    this.setState({
      selectedAtomIds: newSelectedAtomIds,
    });

    if (this.props.onChangeSelection) {
      this.props.onChangeSelection(newSelectedAtomIds);
    }
  }

  render3dMol() {
    const modelData = this.props.modelData;

    if (!modelData.atoms.length || !modelData.bonds.length) {
      return;
    }

    const glviewer = this.glviewer || $3Dmol.createViewer(jQuery(this.container), {
      defaultcolors: $3Dmol.rasmolElementColors,
    });

    const renderingSameModelData = moleculeUtils.modelDataEquivalent(
      this.oldModelData, this.props.modelData
    );
    if (!renderingSameModelData) {
      this.lastStylesByAtom = null;

      glviewer.clear();

      glviewer.addModel(moleculeUtils.modelDataToCDJSON(modelData), 'json', {
        keepH: true,
      });

      // Hack in chain and residue data, since it's not supported by chemdoodle json
      glviewer.getModel().selectedAtoms().forEach((atom) => {
        const modifiedAtom = atom;
        modifiedAtom.atom = modelData.atoms[atom.serial].name;
        modifiedAtom.chain = modelData.atoms[atom.serial].chain;
        modifiedAtom.resi = modelData.atoms[atom.serial].residue_index;
        modifiedAtom.resn = modelData.atoms[atom.serial].residue_name;
      });
    }

    const styleUpdates = new Map(); // style update strings to atom ids needed
    const stylesByAtom = new Map(); // all atom ids to style string
    modelData.atoms.forEach((atom, i) => {
      const selected = this.state.selectedAtomIds.indexOf(atom.serial) !== -1;
      const libStyle = libUtils.getLibStyle(
        atom, selected, this.props.atomLabelsShown, this.props.styles[i]
      );

      if (this.props.atomLabelsShown) {
        glviewer.addLabel(atom.name, {
          fontSize: DEFAULT_FONT_SIZE,
          position: {
            x: atom.positions[0],
            y: atom.positions[1],
            z: atom.positions[2],
          },
        });
      }

      const libStyleString = JSON.stringify(libStyle);
      stylesByAtom.set(atom.serial, libStyleString);

      // If the style string for this atom is the same as last time, then no
      // need to set it again
      if (this.lastStylesByAtom &&
        this.lastStylesByAtom.get(atom.serial) === libStyleString) {
        return;
      }

      // Initialize list of atom serials for this style string, if needed
      if (!styleUpdates.has(libStyleString)) {
        styleUpdates.set(libStyleString, []);
      }

      styleUpdates.get(libStyleString).push(atom.serial);
    });

    this.lastStylesByAtom = stylesByAtom;

    // Set these style types using a minimum number of calls to 3DMol
    for (const [libStyleString, atomSerials] of styleUpdates) {
      glviewer.setStyle({ serial: atomSerials }, JSON.parse(libStyleString));
    }

    // Shapes
    glviewer.removeAllShapes();
    this.props.shapes.forEach((shape) => {
      if (shape.type) {
        glviewer[`add${shape.type}`](libUtils.getShapeSpec(shape, this.setSelectionTrait));
      }
    });

    // Orbital
    const orbital = this.props.orbital;
    if (orbital.cube_file) {
      const volumeData = new $3Dmol.VolumeData(orbital.cube_file, 'cube');
      glviewer.addIsosurface(volumeData, {
        isoval: orbital.iso_val,
        color: ORBITAL_COLOR_POSITIVE,
        opacity: orbital.opacity,
      });
      glviewer.addIsosurface(volumeData, {
        isoval: -orbital.iso_val,
        color: ORBITAL_COLOR_NEGATIVE,
        opacity: orbital.opacity,
      });
    }

    glviewer.setBackgroundColor(
      libUtils.colorStringToNumber(this.props.backgroundColor),
      this.props.backgroundOpacity
    );

    glviewer.setClickable({}, true, this.onClick);
    glviewer.render();

    if (!renderingSameModelData) {
      glviewer.zoomTo();
      glviewer.zoom(0.8, 2000);
    }

    this.oldModelData = modelData;
    this.glviewer = glviewer;
  }

  render() {
    return (
      <div
        className="molecule-3d"
        style={{
          width: this.props.width,
          height: this.props.height,
          position: 'relative',
          margin: '0 auto',
        }}
        ref={(c) => { this.container = c; }}
      />
    );
  }
}

export default Molecule3d;
