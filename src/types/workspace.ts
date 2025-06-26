export interface IndexingProgress {
  currentFile: string;
  totalFiles: number;
  processedFiles: number;
  currentPhase: 'scanning' | 'parsing' | 'analyzing' | 'complete';
  percentage: number;
}

export interface ASTNode {
  type: string;
  name: string;
  line: number;
  column: number;
  children?: ASTNode[];
}

export interface FunctionInfo {
  name: string;
  line: number;
  parameters: string[];
  returnType?: string;
  isExported: boolean;
  isAsync: boolean;
  complexity: number;
}

export interface ClassInfo {
  name: string;
  line: number;
  methods: FunctionInfo[];
  properties: PropertyInfo[];
  extends?: string;
  implements: string[];
  isExported: boolean;
}

export interface InterfaceInfo {
  name: string;
  line: number;
  properties: PropertyInfo[];
  extends: string[];
  isExported: boolean;
}

export interface VariableInfo {
  name: string;
  line: number;
  type?: string;
  isExported: boolean;
  isConst: boolean;
  isLet: boolean;
  isVar: boolean;
  isConstant: boolean;
}

export interface PropertyInfo {
  name: string;
  type?: string;
  isOptional: boolean;
  isReadonly: boolean;
  defaultValue?: string;
}

export interface WorkspaceFile {
  path: string;
  relativePath: string;
  name: string;
  extension: string;
  language: string;
  size: number;
  lastModified: number;
  isHidden: boolean;
  isDirectory: boolean;
}

export interface ParsedFile {
  file: WorkspaceFile;
  imports: string[];
  exports: string[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
  interfaces: InterfaceInfo[];
  variables: VariableInfo[];
  dependencies: string[];
  complexity: number;
  linesOfCode: number;
  commentLines: number;
  error?: string;
}

export interface ProjectStructure {
  sourceFiles: WorkspaceFile[];
  testFiles: WorkspaceFile[];
  configFiles: WorkspaceFile[];
  documentationFiles: WorkspaceFile[];
  rootFiles: WorkspaceFile[];
  packageFiles: WorkspaceFile[];
  directories: any[];
}

export interface DependencyInfo {
  dependencies: string[];
  devDependencies: string[];
  peerDependencies: string[];
  scripts: Record<string, string>;
  frameworks: string[];
  buildTools: string[];
  packageJson?: any;
}

export interface WorkspaceStatistics {
  totalFiles: number;
  totalLines: number;
  totalFunctions: number;
  totalClasses: number;
  totalInterfaces: number;
  totalVariables: number;
  averageComplexity: number;
  languages: Record<string, number>;
  fileTypes: Record<string, number>;
  largestFiles: WorkspaceFile[];
  mostComplexFiles: ParsedFile[];
}

export interface WorkspaceIndex {
  id: string;
  workspacePath: string;
  files: WorkspaceFile[];
  parsedFiles: ParsedFile[];
  projectStructure: ProjectStructure;
  dependencies: DependencyInfo;
  statistics: WorkspaceStatistics;
  createdAt: number;
  updatedAt: number;
}
