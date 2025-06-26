import * as fs from "fs";
import * as path from "path";
import { Logger, debugOutputChannel } from "../../utils";
import {
  WorkspaceFile,
  ParsedFile,
  ASTNode,
  FunctionInfo,
  ClassInfo,
  InterfaceInfo,
  VariableInfo,
  PropertyInfo
} from "../../types";

export interface ParserOptions {
  includeComments?: boolean;
  includeImports?: boolean;
  includeExports?: boolean;
  maxFileSize?: number; // bytes
  timeout?: number; // milliseconds
}

export abstract class BaseASTParser {
  protected options: ParserOptions;

  constructor(options: ParserOptions = {}) {
    this.options = {
      includeComments: true,
      includeImports: true,
      includeExports: true,
      maxFileSize: 1024 * 1024, // 1MB
      timeout: 30000, // 30 seconds
      ...options
    };
  }

  /**
   * Parse một file và trả về thông tin chi tiết
   */
  public abstract parseFile(file: WorkspaceFile): Promise<ParsedFile>;

  /**
   * Kiểm tra xem parser có hỗ trợ file type này không
   */
  public abstract supportsFile(file: WorkspaceFile): boolean;

  /**
   * Đọc nội dung file
   */
  protected async readFileContent(file: WorkspaceFile): Promise<string> {
    try {
      // Kiểm tra file size
      if (file.size > this.options.maxFileSize!) {
        throw new Error(`File too large: ${file.size} bytes`);
      }

      const content = await fs.promises.readFile(file.path, 'utf-8');
      return content;
    } catch (error) {
      Logger.logDebug(debugOutputChannel, `[ASTParser] Error reading file ${file.path}:`, error);
      throw error;
    }
  }

  /**
   * Tính complexity của function
   */
  protected calculateComplexity(content: string): number {
    const complexityKeywords = [
      'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'catch', '&&', '||', '?', ':'
    ];

    let complexity = 1;
    for (const keyword of complexityKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      const matches = content.match(regex);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  /**
   * Đếm lines of code
   */
  protected countLinesOfCode(content: string): { total: number; comment: number } {
    const lines = content.split('\n');
    let totalLines = lines.length;
    let commentLines = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('*/')) {
        commentLines++;
      }
    }

    return { total: totalLines, comment: commentLines };
  }

  /**
   * Tạo ParsedFile với error
   */
  protected createErrorParsedFile(file: WorkspaceFile, error: string): ParsedFile {
    return {
      file,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
      variables: [],
      dependencies: [],
      complexity: 0,
      linesOfCode: 0,
      commentLines: 0,
      error
    };
  }
}

/**
 * TypeScript/JavaScript AST Parser sử dụng regex patterns
 */
export class TypeScriptASTParser extends BaseASTParser {
  public supportsFile(file: WorkspaceFile): boolean {
    return ['.ts', '.js', '.tsx', '.jsx'].includes(file.extension.toLowerCase());
  }

  public async parseFile(file: WorkspaceFile): Promise<ParsedFile> {
    try {
      const content = await this.readFileContent(file);
      const { total: linesOfCode, comment: commentLines } = this.countLinesOfCode(content);

      const parsedFile: ParsedFile = {
        file,
        imports: this.extractImports(content),
        exports: this.extractExports(content),
        functions: this.extractFunctions(content),
        classes: this.extractClasses(content),
        interfaces: this.extractInterfaces(content),
        variables: this.extractVariables(content),
        dependencies: this.extractDependencies(content),
        complexity: this.calculateComplexity(content),
        linesOfCode,
        commentLines
      };

      return parsedFile;
    } catch (error) {
      Logger.logDebug(debugOutputChannel, `[TypeScriptASTParser] Error parsing ${file.path}:`, error);
      return this.createErrorParsedFile(file, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"`]([^'"`]+)['"`]/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];
    const exportRegex = /export\s+(?:default\s+)?(?:function\s+(\w+)|class\s+(\w+)|interface\s+(\w+)|const\s+(\w+)|let\s+(\w+)|var\s+(\w+)|(\w+))/g;

    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      const exported = match.slice(1).find(name => name);
      if (exported) {
        exports.push(exported);
      }
    }

    return exports;
  }

  private extractFunctions(content: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];

    // Function declarations
    const functionDeclRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/g;
    let match;
    while ((match = functionDeclRegex.exec(content)) !== null) {
      const name = match[1];
      const params = match[2].split(',').map(p => p.trim()).filter(p => p);
      const returnType = match[3]?.trim();
      const isExported = content.substring(0, match.index).includes('export');
      const isAsync = content.substring(0, match.index).includes('async');

      functions.push({
        name,
        line: this.getLineNumber(content, match.index),
        parameters: params,
        returnType,
        isExported,
        isAsync,
        complexity: this.calculateComplexity(match[0])
      });
    }

    // Arrow functions
    const arrowFuncRegex = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[:=]\s*(?:async\s*)?\(([^)]*)\)\s*=>/g;
    while ((match = arrowFuncRegex.exec(content)) !== null) {
      const name = match[1];
      const params = match[2].split(',').map(p => p.trim()).filter(p => p);
      const isExported = content.substring(0, match.index).includes('export');

      functions.push({
        name,
        line: this.getLineNumber(content, match.index),
        parameters: params,
        isExported,
        isAsync: false,
        complexity: this.calculateComplexity(match[0])
      });
    }

    return functions;
  }

  private extractClasses(content: string): ClassInfo[] {
    const classes: ClassInfo[] = [];
    const classRegex = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/g;

    let match;
    while ((match = classRegex.exec(content)) !== null) {
      const name = match[1];
      const extendsClass = match[2];
      const implementsInterfaces = match[3]?.split(',').map(i => i.trim()) || [];
      const isExported = content.substring(0, match.index).includes('export');

      // Extract methods and properties from class body
      const classBodyStart = content.indexOf('{', match.index);
      const classBodyEnd = this.findClosingBrace(content, classBodyStart);
      const classBody = content.substring(classBodyStart + 1, classBodyEnd);

      classes.push({
        name,
        line: this.getLineNumber(content, match.index),
        methods: this.extractClassMethods(classBody),
        properties: this.extractClassProperties(classBody),
        extends: extendsClass,
        implements: implementsInterfaces,
        isExported
      });
    }

    return classes;
  }

  private extractInterfaces(content: string): InterfaceInfo[] {
    const interfaces: InterfaceInfo[] = [];
    const interfaceRegex = /(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([^{]+))?/g;

    let match;
    while ((match = interfaceRegex.exec(content)) !== null) {
      const name = match[1];
      const extendsInterfaces = match[2]?.split(',').map(i => i.trim()) || [];
      const isExported = content.substring(0, match.index).includes('export');

      // Extract properties from interface body
      const interfaceBodyStart = content.indexOf('{', match.index);
      const interfaceBodyEnd = this.findClosingBrace(content, interfaceBodyStart);
      const interfaceBody = content.substring(interfaceBodyStart + 1, interfaceBodyEnd);

      interfaces.push({
        name,
        line: this.getLineNumber(content, match.index),
        properties: this.extractInterfaceProperties(interfaceBody),
        extends: extendsInterfaces,
        isExported
      });
    }

    return interfaces;
  }

  private extractVariables(content: string): VariableInfo[] {
    const variables: VariableInfo[] = [];
    const varRegex = /(?:export\s+)?(const|let|var)\s+(\w+)(?:\s*:\s*([^=;]+))?(?:\s*=\s*([^;]+))?/g;

    let match;
    while ((match = varRegex.exec(content)) !== null) {
      const declaration = match[1];
      const name = match[2];
      const type = match[3]?.trim();
      const isExported = content.substring(0, match.index).includes('export');

      variables.push({
        name,
        line: this.getLineNumber(content, match.index),
        type,
        isExported,
        isConst: declaration === 'const',
        isLet: declaration === 'let',
        isVar: declaration === 'var',
        isConstant: declaration === 'const'
      });
    }

    return variables;
  }

  private extractDependencies(content: string): string[] {
    const dependencies: string[] = [];

    // Import dependencies
    const importRegex = /import\s+.*?from\s+['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      dependencies.push(match[1]);
    }

    // Require dependencies
    const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      dependencies.push(match[1]);
    }

    return dependencies;
  }

  private extractClassMethods(classBody: string): FunctionInfo[] {
    const methods: FunctionInfo[] = [];
    const methodRegex = /(?:async\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/g;

    let match;
    while ((match = methodRegex.exec(classBody)) !== null) {
      const name = match[1];
      const params = match[2].split(',').map(p => p.trim()).filter(p => p);
      const returnType = match[3]?.trim();
      const isAsync = classBody.substring(0, match.index).includes('async');

      methods.push({
        name,
        line: 0, // Will be calculated relative to class
        parameters: params,
        returnType,
        isExported: false,
        isAsync,
        complexity: this.calculateComplexity(match[0])
      });
    }

    return methods;
  }

  private extractClassProperties(classBody: string): PropertyInfo[] {
    const properties: PropertyInfo[] = [];
    const propertyRegex = /(\w+)(?:\s*:\s*([^;=]+))?(?:\s*=\s*([^;]+))?;/g;

    let match;
    while ((match = propertyRegex.exec(classBody)) !== null) {
      const name = match[1];
      const type = match[2]?.trim();
      const defaultValue = match[3]?.trim();

      properties.push({
        name,
        type,
        isOptional: type?.includes('?') || false,
        isReadonly: classBody.substring(0, match.index).includes('readonly'),
        defaultValue
      });
    }

    return properties;
  }

  private extractInterfaceProperties(interfaceBody: string): PropertyInfo[] {
    const properties: PropertyInfo[] = [];
    const propertyRegex = /(\w+)(?:\s*\?\s*)?\s*:\s*([^;]+);/g;

    let match;
    while ((match = propertyRegex.exec(interfaceBody)) !== null) {
      const name = match[1];
      const type = match[2]?.trim();
      const isOptional = interfaceBody.substring(0, match.index).includes('?');

      properties.push({
        name,
        type,
        isOptional,
        isReadonly: interfaceBody.substring(0, match.index).includes('readonly'),
        defaultValue: undefined
      });
    }

    return properties;
  }

  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }

  private findClosingBrace(content: string, startIndex: number): number {
    let braceCount = 0;
    let inString = false;
    let stringChar = '';

    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];

      if (!inString) {
        if (char === '"' || char === "'" || char === '`') {
          inString = true;
          stringChar = char;
        } else if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            return i;
          }
        }
      } else if (char === stringChar) {
        inString = false;
      }
    }

    return content.length;
  }
}

/**
 * Python AST Parser
 */
export class PythonASTParser extends BaseASTParser {
  public supportsFile(file: WorkspaceFile): boolean {
    return file.extension.toLowerCase() === '.py';
  }

  public async parseFile(file: WorkspaceFile): Promise<ParsedFile> {
    try {
      const content = await this.readFileContent(file);
      const { total: linesOfCode, comment: commentLines } = this.countLinesOfCode(content);

      const parsedFile: ParsedFile = {
        file,
        imports: this.extractImports(content),
        exports: this.extractExports(content),
        functions: this.extractFunctions(content),
        classes: this.extractClasses(content),
        interfaces: [], // Python doesn't have interfaces like TypeScript
        variables: this.extractVariables(content),
        dependencies: this.extractDependencies(content),
        complexity: this.calculateComplexity(content),
        linesOfCode,
        commentLines
      };

      return parsedFile;
    } catch (error) {
      Logger.logDebug(debugOutputChannel, `[PythonASTParser] Error parsing ${file.path}:`, error);
      return this.createErrorParsedFile(file, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /(?:from\s+([^\s]+)\s+import|import\s+([^\s]+))/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const module = match[1] || match[2];
      if (module) {
        imports.push(module);
      }
    }

    return imports;
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];
    const exportRegex = /__all__\s*=\s*\[([^\]]+)\]/g;

    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      const exportList = match[1].split(',').map(e => e.trim().replace(/['"]/g, ''));
      exports.push(...exportList);
    }

    return exports;
  }

  private extractFunctions(content: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const functionRegex = /(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?/g;

    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      const name = match[1];
      const params = match[2].split(',').map(p => p.trim()).filter(p => p);
      const returnType = match[3]?.trim();
      const isAsync = content.substring(0, match.index).includes('async');

      functions.push({
        name,
        line: this.getLineNumber(content, match.index),
        parameters: params,
        returnType,
        isExported: false, // Python doesn't have explicit exports like TypeScript
        isAsync,
        complexity: this.calculateComplexity(match[0])
      });
    }

    return functions;
  }

  private extractClasses(content: string): ClassInfo[] {
    const classes: ClassInfo[] = [];
    const classRegex = /class\s+(\w+)(?:\s*\(([^)]*)\))?/g;

    let match;
    while ((match = classRegex.exec(content)) !== null) {
      const name = match[1];
      const inheritance = match[2]?.trim() || '';

      classes.push({
        name,
        line: this.getLineNumber(content, match.index),
        methods: [], // Would need more complex parsing for class methods
        properties: [],
        extends: inheritance || undefined,
        implements: [],
        isExported: false
      });
    }

    return classes;
  }

  private extractVariables(content: string): VariableInfo[] {
    const variables: VariableInfo[] = [];
    const varRegex = /(\w+)\s*[:=]\s*([^#\n]+)/g;

    let match;
    while ((match = varRegex.exec(content)) !== null) {
      const name = match[1];
      const value = match[2]?.trim();

      variables.push({
        name,
        line: this.getLineNumber(content, match.index),
        type: undefined, // Python is dynamically typed
        isExported: false,
        isConst: false,
        isLet: false,
        isVar: true,
        isConstant: false // Python doesn't have const like TypeScript
      });
    }

    return variables;
  }

  private extractDependencies(content: string): string[] {
    return this.extractImports(content);
  }

  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }
}

/**
 * Factory để tạo parser phù hợp
 */
export class ASTParserFactory {
  private static parsers: BaseASTParser[] = [
    new TypeScriptASTParser(),
    new PythonASTParser()
  ];

  public static getParser(file: WorkspaceFile): BaseASTParser | null {
    for (const parser of this.parsers) {
      if (parser.supportsFile(file)) {
        return parser;
      }
    }
    return null;
  }

  public static addParser(parser: BaseASTParser): void {
    this.parsers.push(parser);
  }
}