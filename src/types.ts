import { DotPropPathsUnion, PathValue } from "@andyrmitchell/objects";

export type ConfigLocation = {
    type: 'file',
    file?:string, 
    path_from_package_root?:string,
    path_absolute?: string
}

export interface ITypedConfig<T extends Record<string, any>> {
    
    
    get<P extends DotPropPathsUnion<T>>(path: P): Promise<PathValue<T, P> | undefined>;

    getSync<P extends DotPropPathsUnion<T>>(path: P): PathValue<T, P> | undefined;

    set<P extends DotPropPathsUnion<T>>(path: P, value: PathValue<T, P>): Promise<void>;

    merge(object:Partial<T>):Promise<void>;

    reset(object?:T):Promise<void>;

    dispose(): Promise<void>;
}