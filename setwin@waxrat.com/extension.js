// Copyright (c) Michael Cook <michael@waxrat.com> All rights reserved.

'use strict';

const Main = imports.ui.main;
const {Gio, GLib, Shell, Meta, St} = imports.gi;

class Rule {
    constructor(wmclass, title, workspace, x, y, width, height, above, max_match) {
        this.wmclass = wmclass === undefined ? undefined : new RegExp(wmclass);
        this.title = title === undefined ? undefined : new RegExp(title);
        this.workspace = workspace; // 0-based, -1 means sticky (i.e., all workspaces)
        this.x = x;
        this.y = y;
        this.width = width;     // 0 to maximize
        this.height = height;   // 0 to maximize
        this.above = above;     // "Always on top"
        this.max_match = max_match;
    }
}

Rule.prototype.toString = function() {
  return `Rule(${this.wmclass},${this.title},${this.workspace},` +
         `${this.x},${this.y},${this.width},${this.height},` +
         `${this.above},${this.max_match})`;
}

let _button;

function _buttonPressed() {
    log('setwin: _buttonPressed...');

    let home_dir = GLib.get_home_dir();
    let config_path = GLib.build_filenamev([home_dir, '.config/setwin.json']);

    let contents = Shell.get_file_contents_utf8_sync(config_path);

    let configs = JSON.parse(contents);

    /*
      Create the array of Rules objects from the `config_path` file
     */
    let rules = [];
    configs.forEach(function (cfg) {
        let wmclass = cfg['wmclass'];
        let title = cfg['title'];
        let workspace = cfg['workspace'];
        let x = cfg['x'];
        let y = cfg['y'];
        let width = cfg['width'];
        let height = cfg['height'];
        let above = cfg['above'];
        let max_match = cfg['max_match'];
        let rule = new Rule(wmclass, title, workspace, x, y, width, height, above, max_match);
        // log(`setwin: rule ${rule}`);
        rules.push(rule);
    });

    log(`setwin: Rule count ${rules.length}`);

    /*
      Get the monitor size
    */
    let geo = global.display.get_monitor_geometry(0);  // TODO: support multiple monitors
    log(`setwin: monitor geometry ${geo.x} ${geo.y} ${geo.width} ${geo.height}`);
    let monitor_width = geo.width;
    let monitor_height = geo.height;

    /*
      For each window, try to match each rule.
      If there's a match, then apply the rule's settings to that window
     */
    let actors = global.get_window_actors();
    actors.forEach(function (actor) {
        let mw = actor.meta_window
        let wmclass = mw.get_wm_class();
        let title = mw.get_title();
        log(`setwin: Window "${wmclass}" "${title}"`);

        rules.forEach(function (rule) {
            log(`setwin: Matching ${rule}`);

            if (rule.max_match !== undefined && rule.max_match == 0) {
                log(`setwin: | exhausted max_match`);
                return;
            }

            if (rule.wmclass !== undefined) {
                let wmclass = mw.get_wm_class();
                if (!rule.wmclass.test(wmclass)) {
                    log(`setwin: | wmclass unmatched ${wmclass}`);
                    return;
                }
                log(`setwin: | wmclass matched ${wmclass}`);
            }

            if (rule.title !== undefined) {
                let title = mw.get_title();
                if (!rule.title.test(title)) {
                    log(`setwin: | title unmatched ${title}`);
                    return;
                }
                log(`setwin: | title matched ${title}`);
            }

            log(`setwin: | | APPLY`);

            if (rule.max_match !== undefined)
                --rule.max_match;

            let x = rule.x;
            let y = rule.y;
            let width = rule.width;
            let height = rule.height;

            if (width === 0 && height === 0) {
                log(`setwin: | | | maximize both`);
                mw.maximize(Meta.MaximizeFlags.BOTH);
                x = y = width = height = undefined;
            } else if (width === 0) {
                log(`setwin: | | | maximize horizontal`);
                mw.maximize(Meta.MaximizeFlags.HORIZONTAL);
                x = width = undefined;
            } else if (height === 0) {
                log(`setwin: | | | maximize vertical`);
                mw.maximize(Meta.MaximizeFlags.VERTICAL);
                y = height = undefined;
            }

            if (x !== undefined || y !== undefined || width !== undefined || height != undefined) {
                if (x === undefined)
                    x = actor.get_x();
                else if (x < 0)
                    x = monitor_width + x;
                if (y === undefined)
                    y = actor.get_y();
                else if (y < 0)
                    y = monitor_height + y;
                if (width === undefined)
                    width = actor.get_width();
                else if (width < 0)
                    width = monitor_width + width;
                if (height === undefined)
                    height = actor.get_height();
                else if (height < 0)
                    height = monitor_height + height;
                log(`setwin: | | | x ${x}, y ${y}, w ${width}, h ${height}`);
                mw.move_resize_frame(true, x, y, width, height);
            }

            if (rule.workspace !== undefined) {
                if (rule.workspace == -1) {
                    mw.stick();
                } else {
                    mw.unstick();
                    log(`setwin: | | | workspace ${rule.workspace}`);

                    /* Create new workspaces if necessary */
                    let mgr = global.workspace_manager;
                    for (let i = mgr.n_workspaces; i <= rule.workspace; i++) {
                        log(`setwin: | | | add workspace ${i-1}`);
                        mw.change_workspace_by_index(i - 1, false);
                        mgr.append_new_workspace(false, 0);
                    }

                    mw.change_workspace_by_index(rule.workspace, false);
                }
            }

            if (rule.above !== undefined) {
                if (rule.above) {
                    log(`setwin: | | | make_above`);
                    mw.make_above();
                } else {
                    log(`setwin: | | | unmake_above`);
                    mw.unmake_above();
                }
            }
        });
    });

    log('setwin: _buttonPressed...done');
}

function init() {
    log('setwin: init...');

    _button = new St.Bin({ style_class: 'panel-button',
                           reactive: true,
                           can_focus: true,
                           track_hover: true });
    let icon = new St.Icon({ icon_name: 'system-run-symbolic',
                             style_class: 'system-status-icon' });

    _button.set_child(icon);
    _button.connect('button-press-event', _buttonPressed);

    log('setwin: init...done');
}

function enable() {
    log('setwin: enable...');
    Main.panel._rightBox.insert_child_at_index(_button, 0);
    log('setwin: enable...done');
}

function disable() {
    log('setwin: disable...');
    Main.panel._rightBox.remove_child(_button);
    log('setwin: disable...done');
}
