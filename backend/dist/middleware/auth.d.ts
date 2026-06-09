import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types';
export interface AuthPayload {
    userId: string;
    username: string;
    role: UserRole;
    warehouseId?: string;
}
declare global {
    namespace Express {
        interface Request {
            user?: AuthPayload;
        }
    }
}
export declare function generateToken(payload: AuthPayload): string;
export declare function authMiddleware(req: Request, res: Response, next: NextFunction): void;
export declare function requireRoles(...roles: UserRole[]): (req: Request, res: Response, next: NextFunction) => void;
export declare function getUserById(userId: string): Promise<any>;
