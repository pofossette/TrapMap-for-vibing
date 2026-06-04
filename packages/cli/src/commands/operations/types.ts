/**
 * Options for operations commands registration.
 */
export interface OperationsCommandOptions {
  allowExport: boolean;
  allowEdit: boolean;
  allowDeactivate: boolean;
  allowImport: boolean;
  allowList: boolean;
  allowActivate: boolean;
  allowStatus: boolean;
  allowMigrate: boolean;
  allowCapsuleIndex: boolean;
}
