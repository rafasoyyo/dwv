// namespaces
var dwv = dwv || {};
/** @namespace */
dwv.tool = dwv.tool || {};
// external
var Konva = Konva || {};

/**
 * Drawing tool.
 *
 * This tool is responsible for the draw layer group structure. The layout is:
 *
 * drawLayer
 * |_ positionGroup: name="position-group", id="slice-#_frame-#""
 *    |_ shapeGroup: name="{shape name}-group", id="#"
 *       |_ shape: name="shape"
 *       |_ label: name="label"
 *       |_ extra: line tick, protractor arc...
 *
 * Discussion:
 * - posGroup > shapeGroup
 *    pro: slice/frame display: 1 loop
 *    cons: multi-slice shape splitted in positionGroups
 * - shapeGroup > posGroup
 *    pros: more logical
 *    cons: slice/frame display: 2 loops
 *
 * @constructor
 * @param {Object} app The associated application.
 * @external Konva
 */
dwv.tool.Draw = function (app, shapeFactoryList)
{
    // console.log(shapeFactoryList)
    /**
     * Closure to self: to be used by event handlers.
     * @private
     * @type WindowLevel
     */
    var self = this;
    /**
     * Draw GUI.
     * @type Object
     */
    var gui = null;
    /**
     * Interaction start flag.
     * @private
     * @type Boolean
     */
    var started = false;

    /**
     * Shape factory list
     * @type Object
     */
    this.shapeFactoryList = shapeFactoryList;

    this.getShapeEditor = function(){
        return shapeEditor;
    };

    /**
     * Draw command.
     * @private
     * @type Object
     */
    var command = null;
    /**
     * Current shape group.
     * @private
     * @type Object
     */
    var shapeGroup = null;

    /**
     * Shape name.
     * @type String
     */
    this.shapeName = 0;

    /**
     * List of points.
     * @private
     * @type Array
     */
    var points = [];

    /**
     * Last selected point.
     * @private
     * @type Object
     */
    var lastPoint = null;

    /**
     * Shape editor.
     * @private
     * @type Object
     */
    var shapeEditor = new dwv.tool.ShapeEditor(app);

    // associate the event listeners of the editor
    //  with those of the draw tool
    shapeEditor.setDrawEventCallback(fireEvent);

    this.getShapeEditor = function(){
        return shapeEditor;
    };

    /**
     * Trash draw: a cross.
     * @private
     * @type Object
     */
    var trash = new Konva.Group();

    // first line of the cross
    var trashLine1 = new Konva.Line({
        points: [-10, -10, 10, 10 ],
        stroke: 'red'
    });
    // second line of the cross
    var trashLine2 = new Konva.Line({
        points: [10, -10, -10, 10 ],
        stroke: 'red'
    });
    trash.add(trashLine1);
    trash.add(trashLine2);

    /**
     * Drawing style.
     * @type Style
     */
    this.style = new dwv.html.Style();

    /**
     * Event listeners.
     * @private
     */
    var listeners = {};

    /**
     * The associated draw layer.
     * @private
     * @type Object
     */
    var drawLayer = null;

    /**
     * Handle mouse down event.
     * @param {Object} event The mouse down event.
     */
    this.mousedown = function(event){
        // determine if the click happened in an existing shape
        var stage = app.getDrawStage();
        var kshape = stage.getIntersection({
            x: event._xs,
            y: event._ys
        });

        if ( kshape ) {
            var group = kshape.getParent();
            var selectedShape = group.find(".shape")[0];
            // reset editor if click on other shape
            // (and avoid anchors mouse down)
            if ( selectedShape && selectedShape !== shapeEditor.getShape() ) {
                shapeEditor.disable();
                shapeEditor.setShape(selectedShape);
                shapeEditor.setImage(app.getImage());
                shapeEditor.enable();
            }
        }
        else {
            // disable edition
            shapeEditor.disable();
            shapeEditor.setShape(null);
            shapeEditor.setImage(null);
            // start storing points
            started = true;
            // clear array
            points = [];
            // store point
            lastPoint = new dwv.math.Point2D(event._x, event._y);
            points.push(lastPoint);
        }
    };

    /**
     * Handle mouse move event.
     * @param {Object} event The mouse move event.
     */
    this.mousemove = function(event){
        if (!started)
        {
            return;
        }
        if ( Math.abs( event._x - lastPoint.getX() ) > 0 ||
                Math.abs( event._y - lastPoint.getY() ) > 0 )
        {
            // current point
            lastPoint = new dwv.math.Point2D(event._x, event._y);
            // clear last added point from the list (but not the first one)
            if ( points.length != 1 ) {
                points.pop();
            }
            // add current one to the list
            points.push( lastPoint );
            // allow for anchor points
            var factory = new self.shapeFactoryList[self.shapeName]();
            if( points.length < factory.getNPoints() ) {
                clearTimeout(this.timer);
                this.timer = setTimeout( function () {
                    points.push( lastPoint );
                }, factory.getTimeout() );
            }
            // remove previous draw
            if ( shapeGroup ) {
                shapeGroup.destroy();
            }
            // create shape group
            shapeGroup = factory.create(points, self.style, app.getImage());
            // do not listen during creation
            var shape = shapeGroup.getChildren( function (node) {
                return node.name() === 'shape';
            })[0];
            shape.listening(false);
            drawLayer.hitGraphEnabled(false);
            // draw shape command
            command = new dwv.tool.DrawGroupCommand(shapeGroup, self.shapeName, drawLayer, true);
            // draw
            command.execute();
        }
    };

    /**
     * Get the current position draw group id.
     * @return {Number} The group id.
     */
    var getDrawCurrentPositionGroupId = function () {
        var currentSlice = app.getViewController().getCurrentPosition().k;
        var currentFrame = app.getViewController().getCurrentFrame();
        return dwv.getDrawPositionGroupId(currentSlice, currentFrame);
    };

    /**
     * Handle mouse up event.
     * @param {Object} event The mouse up event.
     */
    this.mouseup = function (/*event*/){
        if (started && points.length > 1 )
        {
            // reset shape group
            if ( shapeGroup ) {
                shapeGroup.destroy();
            }
            // create final shape
            var factory = new self.shapeFactoryList[self.shapeName]();
            var group = factory.create(points, self.style, app.getImage());
            group.id( dwv.math.guid() );

            // get position groups
            var posGroupId = getDrawCurrentPositionGroupId();
            var posGroups = drawLayer.getChildren( function (node) {
                return node.id() === posGroupId;
            });
            // if one group, use it
            // if no group, create one
            var posGroup = null;
            if ( posGroups.length === 1 ) {
                posGroup = posGroups[0];
            } else if ( posGroups.length === 0 ) {
                posGroup = new Konva.Group();
                posGroup.name("position-group");
                posGroup.id(posGroupId);
                posGroup.visible(true); // dont inherit
            }
            // add group to slice group
            posGroup.add(group);

            // re-activate layer
            drawLayer.hitGraphEnabled(true);
            // draw shape command
            command = new dwv.tool.DrawGroupCommand(group, self.shapeName, drawLayer);
            command.onExecute = fireEvent;
            command.onUndo = fireEvent;
            // execute it
            command.execute();
            // save it in undo stack
            app.addToUndoStack(command);

            // set shape on
            var shape = group.getChildren( function (node) {
                return node.name() === 'shape';
            })[0];
            self.setShapeOn( shape );
        }
        // reset flag
        started = false;
    };

    /**
     * Handle mouse out event.
     * @param {Object} event The mouse out event.
     */
    this.mouseout = function(event){
        self.mouseup(event);
    };

    /**
     * Handle touch start event.
     * @param {Object} event The touch start event.
     */
    this.touchstart = function(event){
        self.mousedown(event);
    };

    /**
     * Handle touch move event.
     * @param {Object} event The touch move event.
     */
    this.touchmove = function(event){
        self.mousemove(event);
    };

    /**
     * Handle touch end event.
     * @param {Object} event The touch end event.
     */
    this.touchend = function(event){
        self.mouseup(event);
    };

    /**
     * Handle key down event.
     * @param {Object} event The key down event.
     */
    this.keydown = function(event){
        app.onKeydown(event);
    };

    /**
     * Clone selected Draw to a new layer
     * @param  {Number} inLayer Layer index to append the draw
     * @param  {Boolean} restart Conditional to set initial layer as visible or not
     */
    this.cloneDraw = function(inLayer, restart){
        if(isNaN(inLayer)){
            throw new Error("Layer index is needed. Shape will be append to this layer.");
        }
        if(inLayer < 0 || inLayer > app.getNSlicesToLoad()){
            throw new Error("Layer is not available.");
        }

        var iShape = shapeEditor.getShape();
        if(!iShape || typeof iShape === 'undefined'){
            throw new Error("No shape selected.");
        }

        // Disable shape editor
        shapeEditor.disable();
        shapeEditor.setShape(null);
        shapeEditor.setImage(null);

        var view = app.getViewController();
        var pos  = view.getCurrentPosition();
        view.setCurrentPosition({i: pos.i, j: pos.j, k: inLayer});

        var group = iShape.getParent();
        // Get label to get custom elements textExpr and quant
        var label = (group.getChildren()).filter(function(children){
            return children.getClassName() === 'Label';
        })[0];

        var clone = group.clone();
        clone.id( group.getId() );
        // Override label to add custom elements textExpr and quant
        for(var c=0, cl=clone.getChildren().length ; c<cl ; c++){
            if(clone.children[c].getClassName() === 'Label'){
                clone.children[c] = label;
                break;
            }
        }

        // Draw cloned shape
        var command = new dwv.tool.DrawGroupCommand( clone,
            dwv.tool.GetShapeDisplayName(iShape),
            app.getCurrentDrawLayer()
        );
        command.onExecute = fireEvent;
        command.onUndo = fireEvent;
        // execute it
        command.execute();
        // save it in undo stack
        app.addToUndoStack(command);

        // return to initial slice
        if(restart){
            view.setCurrentPosition(pos);
        }

    };

    /**
     * Delete selected Draw.
     * @param  {Object} shape contained by the group to delete.
     */
    this.deleteDraw = function(inshape){

        var iShape = inshape || shapeEditor.getShape();
        if(!iShape || typeof iShape === 'undefined'){
            throw new Error("No shape selected.");
        }

        // Disable shape editor
        shapeEditor.disable();
        shapeEditor.setShape(null);
        shapeEditor.setImage(null);

        // delete command
        var delcmd = new dwv.tool.DeleteGroupCommand(iShape.getParent(),
            dwv.tool.GetShapeDisplayName(iShape), app.getCurrentDrawLayer());
        delcmd.onExecute = fireEvent;
        delcmd.onUndo = fireEvent;
        delcmd.execute();
        app.addToUndoStack(delcmd);
    };

    /**
     * Setup the tool GUI.
     */
    this.setup = function ()
    {
        gui = new dwv.gui.Draw(app);
        gui.setup(this.shapeFactoryList);
    };

    /**
     * Enable the tool.
     * @param {Boolean} flag The flag to enable or not.
     */
    this.display = function ( flag ){
        if ( gui ) {
            gui.display( flag );
        }
        // reset shape display properties
        shapeEditor.disable();
        shapeEditor.setShape(null);
        shapeEditor.setImage(null);
        document.body.style.cursor = 'default';
        // make layer listen or not to events
        app.getDrawStage().listening( flag );
        // get the current draw layer
        drawLayer = app.getCurrentDrawLayer();
        renderDrawLayer(flag);
        // listen to app change to update the draw layer
        if (flag) {
            app.addEventListener("slice-change", updateDrawLayer);
            app.addEventListener("frame-change", updateDrawLayer);
        }
        else {
            app.removeEventListener("slice-change", updateDrawLayer);
            app.removeEventListener("frame-change", updateDrawLayer);
        }
    };

    /**
     * Get the current app draw layer.
     */
    function updateDrawLayer() {
        // deactivate the old draw layer
        //renderDrawLayer(false);
        // get the current draw layer
        //drawLayer = app.getCurrentDrawLayer();
        // activate the new draw layer
        renderDrawLayer(true);
    }

    /**
     * Render (or not) the draw layer.
     * @param {Boolean} visible Set the draw layer visible or not.
     */
    function renderDrawLayer(visible) {

        drawLayer.listening( visible );
        drawLayer.hitGraphEnabled( visible );

        // get shape groups at the current position
        var posGroupId = getDrawCurrentPositionGroupId();
        var shapeGroups = dwv.getDrawShapeGroupsAtPosition(posGroupId, drawLayer);

        var shapes = [];
        var fshape = function (node) {
            return node.name() === 'shape';
        };
        for ( var i = 0; i < shapeGroups.length; ++i ) {
            // should only be one shape per group
            shapes.push( shapeGroups[i].getChildren(fshape)[0] );
        }
        // set shape display properties
        if ( visible ) {
            app.addToolCanvasListeners( app.getDrawStage().getContent() );
            shapes.forEach( function (shape){ self.setShapeOn( shape ); });
        }
        else {
            app.removeToolCanvasListeners( app.getDrawStage().getContent() );
            shapes.forEach( function (shape){ setShapeOff( shape ); });
        }
        // draw
        drawLayer.draw();
    }

    /**
     * Set shape off properties.
     * @param {Object} shape The shape to set off.
     */
    function setShapeOff( shape ) {
        // mouse styling
        shape.off('mouseover');
        shape.off('mouseout');
        // drag
        shape.draggable(false);
        shape.off('dragstart');
        shape.off('dragmove');
        shape.off('dragend');
        shape.off('dblclick');
    }

    /**
     * Get the real position from an event.
     */
    function getRealPosition( index ) {
        var stage = app.getDrawStage();
        return { 'x': stage.offset().x + index.x / stage.scale().x,
            'y': stage.offset().y + index.y / stage.scale().y };
    }

    /**
     * Set shape on properties.
     * @param {Object} shape The shape to set on.
     */
    this.setShapeOn = function ( shape ) {
        console.log(shape)
        // mouse over styling
        shape.on('mouseover', function () {
            document.body.style.cursor = 'pointer';
        });
        // mouse out styling
        shape.on('mouseout', function () {
            document.body.style.cursor = 'default';
        });

        // make it draggable
        shape.draggable(true);
        var dragStartPos = null;
        var dragLastPos = null;

        // command name based on shape type
        var shapeDisplayName = dwv.tool.GetShapeDisplayName(shape);

        // store original colour
        var colour = null;

        // save start position
        dragStartPos = {'x': shape.x(), 'y': shape.y()};

        // drag start event handling
        shape.on('dragstart', function (/*event*/) {
            // colour
            colour = shape.stroke();
            // display trash
            var stage = app.getDrawStage();
            var scale = stage.scale();
            var invscale = {'x': 1/scale.x, 'y': 1/scale.y};
            trash.x( stage.offset().x + ( 256 / scale.x ) );
            trash.y( stage.offset().y + ( 20 / scale.y ) );
            trash.scale( invscale );
            drawLayer.add( trash );
            // deactivate anchors to avoid events on null shape
            shapeEditor.setAnchorsActive(false);
            // draw
            drawLayer.draw();
        });
        // drag move event handling
        shape.on('dragmove', function (event) {
            var pos = {'x': this.x(), 'y': this.y()};
            var translation;
            if ( dragLastPos ) {
                translation = {'x': pos.x - dragLastPos.x,
                    'y': pos.y - dragLastPos.y};
            } else {
                translation = {'x': pos.x - dragStartPos.x,
                    'y': pos.y - dragStartPos.y};
            }
            dragLastPos = pos;
            // highlight trash when on it
            var offset = dwv.html.getEventOffset( event.evt )[0];
            var eventPos = getRealPosition( offset );
            if ( Math.abs( eventPos.x - trash.x() ) < 10 &&
                    Math.abs( eventPos.y - trash.y() ) < 10   ) {
                trash.getChildren().each( function (tshape){ tshape.stroke('orange'); });
                shape.stroke('red');
            }
            else {
                trash.getChildren().each( function (tshape){ tshape.stroke('red'); });
                shape.stroke(colour);
            }
            // update group but not 'this' shape
            var group = this.getParent();
            group.getChildren().each( function (ashape) {
                if ( ashape === shape ) {
                    return;
                }
                ashape.x( ashape.x() + translation.x );
                ashape.y( ashape.y() + translation.y );
            });
            // reset anchors
            shapeEditor.resetAnchors();
            // draw
            drawLayer.draw();
        });
        // drag end event handling
        shape.on('dragend', function (event) {
            var pos = {'x': this.x(), 'y': this.y()};
            dragLastPos = null;
            // remove trash
            trash.remove();
            // delete case
            var offset = dwv.html.getEventOffset( event.evt )[0];
            var eventPos = getRealPosition( offset );
            if ( Math.abs( eventPos.x - trash.x() ) < 10 &&
                    Math.abs( eventPos.y - trash.y() ) < 10   ) {
                // compensate for the drag translation
                var delTranslation = {'x': pos.x - dragStartPos.x,
                        'y': pos.y - dragStartPos.y};
                var group = this.getParent();
                group.getChildren().each( function (ashape) {
                    ashape.x( ashape.x() - delTranslation.x );
                    ashape.y( ashape.y() - delTranslation.y );
                });
                // disable editor
                shapeEditor.disable();
                shapeEditor.setShape(null);
                shapeEditor.setImage(null);
                // reset
                shape.stroke(colour);
                document.body.style.cursor = 'default';
                // delete command
                var delcmd = new dwv.tool.DeleteGroupCommand(this.getParent(),
                    shapeDisplayName, drawLayer);
                delcmd.onExecute = fireEvent;
                delcmd.onUndo = fireEvent;
                delcmd.execute();
                app.addToUndoStack(delcmd);
            }
            else {
                // save drag move
                var translation = {'x': pos.x - dragStartPos.x,
                        'y': pos.y - dragStartPos.y};
                if ( translation.x !== 0 || translation.y !== 0 ) {
                    var mvcmd = new dwv.tool.MoveGroupCommand(this.getParent(),
                        shapeDisplayName, translation, drawLayer);
                    mvcmd.onExecute = fireEvent;
                    mvcmd.onUndo = fireEvent;
                    app.addToUndoStack(mvcmd);

                    // reset start position
                    dragStartPos = {'x': this.x(), 'y': this.y()};
                    // the move is handled by Konva, trigger an event manually
                    fireEvent({'type': 'draw-move'});
                }
                // reset anchors
                shapeEditor.setAnchorsActive(true);
                shapeEditor.resetAnchors();
            }
            // draw
            drawLayer.draw();
        });
        // double click handling: update label
        shape.on('dblclick', function () {

            // get the label object for this shape
            var group = this.getParent();
            var labels = group.find('Label');
            // should just be one
            if (labels.length !== 1) {
                throw new Error("Could not find the shape label.");
            }
            var ktext = labels[0].getText();

            // ask user for new label
            var labelText = dwv.gui.prompt("Shape label", ktext.textExpr);

            // if press cancel do nothing
            if (labelText === null) {
                return;
            }
            else if (labelText === ktext.textExpr) {
                return;
            }
            // update text expression and set text
            ktext.textExpr = labelText;
            ktext.setText(dwv.utils.replaceFlags(ktext.textExpr, ktext.quant));

            // trigger event
            fireEvent({'type': 'draw-change'});

            // draw
            drawLayer.draw();
        });
    };

    /**
     * Initialise the tool.
     */
    this.init = function() {
        // set the default to the first in the list
        var shapeName = 0;
        for( var key in this.shapeFactoryList ){
            shapeName = key;
            break;
        }
        this.setShapeName(shapeName);
        // init gui
        if ( gui ) {
            // init with the app window scale
            this.style.setScale(app.getWindowScale());
            // same for colour
            this.setLineColour(this.style.getLineColour());
            // init html
            gui.initialise();
        }
        return true;
    };

    /**
     * Add an event listener on the app.
     * @param {String} type The event type.
     * @param {Object} listener The method associated with the provided event type.
     */
    this.addEventListener = function (type, listener)
    {
        if ( typeof listeners[type] === "undefined" ) {
            listeners[type] = [];
        }
        listeners[type].push(listener);
    };

    /**
     * Remove an event listener from the app.
     * @param {String} type The event type.
     * @param {Object} listener The method associated with the provided event type.
     */
    this.removeEventListener = function (type, listener)
    {
        if( typeof listeners[type] === "undefined" ) {
            return;
        }
        for ( var i = 0; i < listeners[type].length; ++i )
        {
            if ( listeners[type][i] === listener ) {
                listeners[type].splice(i,1);
            }
        }
    };

    /**
     * Set the line colour of the drawing.
     * @param {String} colour The colour to set.
     */
    this.setLineColour = function (colour)
    {
        this.style.setLineColour(colour);
    };

    // Private Methods -----------------------------------------------------------

    /**
     * Fire an event: call all associated listeners.
     * @param {Object} event The event to fire.
     */
    function fireEvent (event)
    {
        if ( typeof listeners[event.type] === "undefined" ) {
            return;
        }
        for ( var i=0; i < listeners[event.type].length; ++i )
        {
            listeners[event.type][i](event);
        }
    }

}; // Draw class

/**
 * Help for this tool.
 * @return {Object} The help content.
 */
dwv.tool.Draw.prototype.getHelp = function()
{
    return {
        "title": dwv.i18n("tool.Draw.name"),
        "brief": dwv.i18n("tool.Draw.brief"),
        "mouse": {
            "mouse_drag": dwv.i18n("tool.Draw.mouse_drag")
        },
        "touch": {
            "touch_drag": dwv.i18n("tool.Draw.touch_drag")
        }
    };
};

/**
 * Set the shape name of the drawing.
 * @param {String} name The name of the shape.
 */
dwv.tool.Draw.prototype.setShapeName = function(name)
{
    // check if we have it
    if( !this.hasShape(name) )
    {
        throw new Error("Unknown shape: '" + name + "'");
    }
    this.shapeName = name;
};

/**
 * Check if the shape is in the shape list.
 * @param {String} name The name of the shape.
 */
dwv.tool.Draw.prototype.hasShape = function(name) {
    return this.shapeFactoryList[name];
};
