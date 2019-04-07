import ConfigManager from '@sqltools/core/config-manager';
import { EXT_NAME } from '@sqltools/core/constants';
import { ConnectionInterface } from '@sqltools/core/interface';
import { getConnectionDescription, getConnectionId, asArray } from '@sqltools/core/utils';
import { isDeepStrictEqual } from 'util';
import { ExtensionContext, ThemeIcon, TreeItem, TreeItemCollapsibleState, Uri } from 'vscode';
import { DatabaseInterface } from '@sqltools/core/plugin-api';

interface SidebarItemIterface<T extends SidebarItemIterface<any> | never, A = T> {
  parent: SidebarItemIterface<T, A>;
  value: string;
  items: T[] | never;
  conn: ConnectionInterface;
  addItem(item: A): this | never;
}

export abstract class SidebarAbstractItem<T extends SidebarItemIterface<SidebarAbstractItem> = any, A = T> extends TreeItem implements SidebarItemIterface<T, A> {
  tree?: { [id: string]: SidebarAbstractItem };
  abstract parent: SidebarAbstractItem;
  abstract value: string;
  abstract conn: ConnectionInterface;
  abstract items: T[];
  abstract addItem(item: A): this;
}

export class SidebarConnection extends SidebarAbstractItem<SidebarResourceGroup<SidebarAbstractItem>> {
  public static icons;
  public parent = null;
  public contextValue = 'connection';

  public tree: { [id: string]: SidebarResourceGroup } = {};

  public get items() {
    return asArray(this.tree);
  }
  public get description() {
    return getConnectionDescription(this.conn);
  }

  private _isActive = false;

  public get isConnected() {
    return this.conn.isConnected;
  }
  public get id() {
    return <string>this.getId();
  }
  public get value() {
    return this.conn.database;
  }

  public get tooltip() {
    if (this._isActive) return `Active Connection - Queries will run for this connection`;
    return undefined;
  }

  constructor(private context: ExtensionContext, public conn: ConnectionInterface) {
    super(conn.name, TreeItemCollapsibleState.None);
    this.command = {
      title: 'Connect',
      command: `${EXT_NAME}.selectConnection`,
      arguments: [this],
    };

    if (!SidebarConnection.icons) {
      SidebarConnection.icons = {
        active: this.context.asAbsolutePath('icons/database-active.svg'),
        connected: {
          dark: this.context.asAbsolutePath('icons/database-dark.svg'),
          light: this.context.asAbsolutePath('icons/database-light.svg'),
        },
        disconnected: {
          dark: this.context.asAbsolutePath('icons/database-disconnected-dark.svg'),
          light: this.context.asAbsolutePath('icons/database-disconnected-light.svg'),
        }
      }
    }
    this.updateIconPath();
  }

  public updateIconPath() {
    const iconOptions = Object.assign({}, SidebarConnection.icons);
    if (this.conn.icons) {
      if (this.conn.icons.active) {
        iconOptions.active = Uri.parse(this.conn.icons.active);
      }

      if (this.conn.icons.connected) {
        iconOptions.connected = Uri.parse(this.conn.icons.connected);
      }
      if (this.conn.icons.disconnected) {
        iconOptions.disconnected = Uri.parse(this.conn.icons.disconnected);
      }
    }
    this.iconPath = iconOptions.disconnected;
    if (this._isActive) {
      this.iconPath = iconOptions.active;
    } else if (this.contextValue === 'connectedConnection') {
      this.iconPath = iconOptions.connected;
    }
  }

  public getId() {
    return getConnectionId(this.conn);
  }

  public addItem(item: SidebarResourceGroup) {
    if (this.tree[item.value]) return this;

    this.tree[item.value] = this.tree[item.value] || item;
    this.tree[item.value].parent = this;
    this.collapsibleState = this.collapsibleState === TreeItemCollapsibleState.None
      ? TreeItemCollapsibleState.Collapsed
      : this.collapsibleState;
    return this;
  }

  public reset() {
    this.tree = {};
    this.collapsibleState = TreeItemCollapsibleState.None;
    this.deactivate();
  }

  public activate() {
    this._isActive = true;
    this.expand();
    this.contextValue = 'connectedConnection';
    this.updateIconPath();
    return this;
  }

  public deactivate() {
    this._isActive = false;
    this.updateIconPath();
    return this;
  }

  public connect() {
    return this.activate();
  }

  public disconnect() {
    this.contextValue = 'connection';
    this.reset();
    return this;
  }

  public get isActive() {
    return this._isActive;
  }

  public expand() {
    this.collapsibleState = TreeItemCollapsibleState.Expanded;
  }

  public updateCreds(creds: ConnectionInterface) {
    if (isDeepStrictEqual(this.conn, creds)) {
      return false;
    }
    this.conn = creds;
    this.reset();
    return true;
  }
}

export class SidebarTableOrView extends SidebarAbstractItem<SidebarColumn> {
  public contextValue = 'connection.tableOrView';
  public value: string;
  public toString() {
    return this.table.name;
  }

  public get columns(): DatabaseInterface.TableColumn[] {
    return this._columns.map(item => item.column);
  }
  public get items() {
    return this._columns;
  }
  public _columns: SidebarColumn[] = [];

  public parent: SidebarAbstractItem = null;

  public get conn() { return this.parent.conn; }
  public get description() {
    if (typeof this.table.numberOfColumns === 'undefined')  return '';
    return `${this.table.numberOfColumns} cols`;
  }

  constructor(private context: ExtensionContext, public table: DatabaseInterface.Table) {
    super(table.name, (
      ConfigManager.get('tableTreeItemsExpanded', false)
        ? TreeItemCollapsibleState.Expanded
        : TreeItemCollapsibleState.Collapsed
    ));
    this.value = table.name;
    if (this.table.isView) {
      this.iconPath = {
        dark: this.context.asAbsolutePath('icons/view-dark.svg'),
        light: this.context.asAbsolutePath('icons/view-light.svg'),
      };
    } else {
      this.iconPath = {
        dark: this.context.asAbsolutePath('icons/table-dark.svg'),
        light: this.context.asAbsolutePath('icons/table-light.svg'),
      };
    }
  }

  public addItem(item: SidebarColumn) {
    item.parent = this;
    this._columns.push(item);
    return this;
  }
}

export class SidebarColumn extends SidebarAbstractItem<null> {
  static icons;
  public contextValue = 'connection.column';
  public value: string;

  public get items(): null { return null; }

  public addItem(_: never): never {
    throw new Error('Cannot add items to table column');
  }

  public get description() {
    let typeSize = '';
    if (this.column.size !== null) {
      typeSize = `(${this.column.size})`;
    }
    return `${(this.column.type || '').toUpperCase()}${typeSize}`;
  }
  public get conn() { return this.parent.conn; }

  public parent: SidebarAbstractItem = null;

  constructor(private context: ExtensionContext, public column: DatabaseInterface.TableColumn) {
    super(column.columnName, TreeItemCollapsibleState.None);
    this.value = column.columnName;
    if (!SidebarColumn.icons) {
      SidebarColumn.icons = {
        default: {
          dark: this.context.asAbsolutePath('icons/column-dark.svg'),
          light: this.context.asAbsolutePath('icons/column-light.svg'),
        },
        primaryKey: this.context.asAbsolutePath('icons/pk.svg'),
        foreignKey: this.context.asAbsolutePath('icons/fk.svg'),
      }
    }
    this.updateIconPath();
    this.command = {
      title: 'Append to Cursor',
      command: `${EXT_NAME}.insertText`,
      arguments: [this],
    };
  }

  public updateIconPath() {
    this.iconPath = SidebarColumn.icons.default;
    if (this.column.isPk) {
      this.iconPath = SidebarColumn.icons.primaryKey;
    } else if (this.column.isFk) {
      this.iconPath = SidebarColumn.icons.foreignKey;
    }
  }
}


export class SidebarResourceGroup<T extends SidebarAbstractItem = SidebarAbstractItem> extends SidebarAbstractItem<T> {
  public iconPath = ThemeIcon.Folder;
  public contextValue = 'connection.resource_group';
  public value: string;
  public tree: { [name: string]: T } = {};
  public get items() {
    return asArray(this.tree);
  }
  public get description() {
    return this.detail || `${Object.keys(this.tree).length} ${this.label.toLowerCase()}`;
  }
  public get conn() {
    return this.parent.conn;
  }

  public parent: SidebarAbstractItem;

  constructor(public label: string, private detail?: string) {
    super(label, TreeItemCollapsibleState.Collapsed);
    this.value = this.label;
  }

  public addItem(item: T) {
    this.tree[item.value] = this.tree[item.value] || item;
    this.tree[item.value].parent = this;
    return this;
  }

  public reset() {
    this.tree = {};
  }
}

export type SidebarTreeItem = SidebarConnection
| SidebarTableOrView
| SidebarColumn
| SidebarResourceGroup;