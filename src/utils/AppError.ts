/**
 * Classe customizada para erros da aplicação
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Manter prototype chain (importante para instanceof)
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Erros de validação
 */
export class ValidationError extends AppError {
  public readonly errors: any[];

  constructor(message: string, errors: any[] = []) {
    super(message, 400, true);
    this.errors = errors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Erro de autenticação
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Não autenticado') {
    super(message, 401, true);
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Erro de autorização
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Acesso não autorizado') {
    super(message, 403, true);
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

/**
 * Erro de recurso não encontrado
 */
export class NotFoundError extends AppError {
  constructor(resource: string = 'Recurso') {
    super(`${resource} não encontrado`, 404, true);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Erro de conflito (ex: usuário já existe)
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, true);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * Erro de negócio (ex: estoque insuficiente)
 */
export class BusinessLogicError extends AppError {
  constructor(message: string) {
    super(message, 422, true);
    Object.setPrototypeOf(this, BusinessLogicError.prototype);
  }
}

/**
 * Erro interno do servidor
 */
export class InternalServerError extends AppError {
  constructor(message: string = 'Erro interno do servidor') {
    super(message, 500, false);
    Object.setPrototypeOf(this, InternalServerError.prototype);
  }
}
