import { z } from "zod";


import {DotPropPathsUnion, PathValue} from '@andyrmitchell/objects';

import { getProperty, setProperty } from "dot-prop";
import {check, lock} from 'proper-lockfile';
import { fileIoSyncNode, getPackageDirectorySync, stripTrailingSlash } from "@andyrmitchell/file-io";
import { ConfigLocation, ITypedConfig } from "./types";
import { sleep } from "@andyrmitchell/utils";
import merge from "lodash-es/merge";
import { cloneDeep } from "lodash-es";




export class TypedConfig<T extends Record<string, any>> implements ITypedConfig<T> {

    protected schema?: z.Schema<T>;
    protected fileUri:string;
    protected defaultData?:T;
    protected disposed?:boolean;
    private lockReleases: (() => Promise<void>)[];

    constructor(location?:ConfigLocation, defaultData?: T, schema?: z.Schema<T>) {
        this.schema = schema;
        this.defaultData = defaultData;
        this.lockReleases = [];
        this.fileUri = this.generateFileUri(location);
    }

    private generateFileUri(location?:ConfigLocation):string {
        const locationFull:Required<ConfigLocation> = Object.assign(
            {
                type: 'file',
                file: 'tc_main',
                path_from_package_root: 'config',
                path_absolute: ''
            },
            location
        )
        if( !locationFull.path_from_package_root ) throw new Error("BasedTypedConfig location requires path_from_root");
        locationFull.file = locationFull.file.replace(/\.json$/i, '')+'.json';
        
        const root = locationFull.path_absolute? stripTrailingSlash(locationFull.path_absolute) : `${getPackageDirectorySync()}/${locationFull.path_from_package_root}`;
        return `${root}/${locationFull.file}`;
        
    }

    private applyDefault(obj?:Partial<T>):T {

        const updated = Object.assign({}, cloneDeep(this.defaultData), obj);
        
        return updated;
    }

    async get<P extends DotPropPathsUnion<T>>(path:P):Promise<PathValue<T, P> | undefined> {
        const release = await this.applyLock();
        if( this.disposed ) return;

        try {
            return this.getSync(path);
        } finally {
            await release();
        }
    }

    getSync<P extends DotPropPathsUnion<T>>(path:P):PathValue<T, P> | undefined {
    
        let obj:Partial<T> | undefined;

        if( fileIoSyncNode.has_file(this.fileUri) ) {
            const fileContents =  fileIoSyncNode.read(this.fileUri) ?? '{}';
            try {
                obj = JSON.parse(fileContents);
            } catch(e) {
                debugger;
                throw e;
            }
            obj = this.applyDefault(obj);
        } else {
            obj = this.applyDefault();
        }

        if( obj ) {
            const val = getProperty(obj, path) as PathValue<T, P> | undefined;
            if( !val ) return undefined;
            return val;
        }
        return undefined;
        
    
    }

    async set<P extends DotPropPathsUnion<T>>(path:P, value:PathValue<T, P>):Promise<void> {
        

        const release = await this.applyLock();
        if( this.disposed ) return;
        

        

        try {
            const fileContents = fileIoSyncNode.read(this.fileUri) ?? '{}';

            let obj = JSON.parse(fileContents) as T;
            obj = this.applyDefault(obj);

            
            const updatedObj = setProperty(obj, path, value);

            if( this.schema ) {
                const result = this.schema.safeParse(updatedObj);
                if( !result.success ) {
                    let valueJson:string = 'na';
                    try {
                        valueJson = typeof value==='string'? value : JSON.stringify(value);
                    } catch(e) {}
                    let issuesJson:string = 'na';
                    try {
                        issuesJson = JSON.stringify(result.error.issues);
                    } catch(e) {}
                    const baseMessage = `Could not parse the config value.\nPath: ${path}\nValue: ${valueJson}`;
                    //console.log(baseMessage, result.error);
                    throw new Error(`${baseMessage}\nError Message: ${result.error.message}\nError Issues: ${issuesJson}`);
                }
            }

            fileIoSyncNode.write(this.fileUri, JSON.stringify(updatedObj));

        } catch(e) {
            throw e;
        } finally {
            await release();
        }

        
    }

    async merge(object:Partial<T>):Promise<void> {

        const release = await this.applyLock();
        if( this.disposed ) return;
        
        try {
            const fileContents = fileIoSyncNode.read(this.fileUri) ?? '{}';

            let obj = JSON.parse(fileContents) as T;
            obj = this.applyDefault(obj);
            
            const updatedObj = merge(obj, object);

            if( this.schema ) {
                const result = this.schema.safeParse(updatedObj);
                if( !result.success ) {
                    debugger;
                    let objectJson:string = 'na';
                    try {
                        objectJson = JSON.stringify(object);
                    } catch(e) {}
                    let issuesJson:string = 'na';
                    try {
                        issuesJson = JSON.stringify(result.error.issues);
                    } catch(e) {}
                    const baseMessage = `Could not parse the config value.\Object: ${objectJson}`;
                    //console.log(baseMessage, result.error);
                    throw new Error(`${baseMessage}\nError Message: ${result.error.message}\nError Issues: ${issuesJson}`);
                }
            }

            fileIoSyncNode.write(this.fileUri, JSON.stringify(updatedObj));

        } catch(e) {
            debugger;
            throw e;
        } finally {
            await release();
        }

    }

    async reset(object?:T):Promise<void> {
        const release = await this.applyLock();
        if( this.disposed ) return;

        try {
            if( !object ) object = this.applyDefault();
            fileIoSyncNode.write(this.fileUri, object? JSON.stringify(object) : '');
        } catch(e) {
            debugger;
            throw e;
        } finally {
            await release();
        }
    }

    async applyLock() {

        if( this.disposed ) throw new Error("Already disposed - cannot set new lock");

        if( !fileIoSyncNode.has_file(this.fileUri) ) {
            fileIoSyncNode.make_directory(fileIoSyncNode.directory_name(this.fileUri));
            fileIoSyncNode.write(this.fileUri, JSON.stringify({}));
        }

        const release = await lock(this.fileUri, {
            'retries': {
                'retries': 10,
                minTimeout: 500
            }
        });
        if( this.disposed ) {
            await release();
            return () => null;
        }

        this.lockReleases.push(release);

        let released = false;
        return async () => {
            if( released ) return;
            released = true;
            this.lockReleases = this.lockReleases.filter(x => x!==release);
            await release();
        };
    }

    async testActiveLocks():Promise<boolean> {
        const hasLock = await check(this.fileUri);
        return hasLock || this.lockReleases.length>0;
    }

    async dispose():Promise<void> {
        this.disposed = true;
        const releasePromises = this.lockReleases.map(x => x());
        this.lockReleases = [];
        await Promise.all(releasePromises);
        await sleep(500); // Stop Jest complaining about open handles... clearly proper-lockfile's 'release' doesn't clean up as fast as it should 
    }
    

}
