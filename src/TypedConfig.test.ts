import { z } from "zod";
import { TypedConfig } from "./TypedConfig";
import { fileIoSyncNode, getPackageDirectorySync } from "@andyrmitchell/file-io";
import { ConfigLocation } from "./types";
import { uid } from "@andyrmitchell/utils";



const CONFIG_TEST_DIR = `${getPackageDirectorySync()}/tmp_test_config`;

const configSchema = z.object({
    name: z.string(),
    age: z.number().optional(),
    location: z.object({
        street: z.string().optional(), 
        city: z.string().optional()
    }).optional(), 
    pets: z.array(z.string()).optional()
});
type Config = z.infer<typeof configSchema>;
const defaultData:Config = {
    name: 'Alice'
}
const defaultNestedData:Config = {
    name: 'Alice',
    location: {
        city: 'London'
    }
}
const configRelaxedSchema = z.object({
    name: z.string().optional(),
    age: z.number().optional()
});
type ConfigRelaxed = z.infer<typeof configRelaxedSchema>;
const location:ConfigLocation = {type: 'file', path_absolute: `${CONFIG_TEST_DIR}`};

function generateUniqueFileName(location:ConfigLocation):ConfigLocation {
    return Object.assign({}, location, {
        file: `config_${uid().replace(/\-/g, '')}.json`
    })
}

afterAll(async () => {
    fileIoSyncNode.remove_directory(CONFIG_TEST_DIR, true);
})

describe('TypedConfig', () => {


    test('basic', async () => {
    
        const tc = new TypedConfig<ConfigRelaxed>(generateUniqueFileName(location));
        
        expect(tc.getSync('age')).toBe(undefined);

        await tc.set('age', 40);
        expect(tc.getSync('age')).toBe(40);
    
    }, 1000*10);

    test('defaults', async () => {
    
        const tc = new TypedConfig(generateUniqueFileName(location), defaultData);
        
        expect(tc.getSync('name')).toBe('Alice');
        
        await tc.set('name', 'Bob');
        expect(tc.getSync('name')).toBe('Bob');
    
    }, 1000*10);

    test('schema relaxed', async () => {
    
        const tc = new TypedConfig(generateUniqueFileName(location), undefined, configRelaxedSchema);
        
        await tc.set('name', 'Bob');
        expect(tc.getSync('name')).toBe('Bob');
    
    }, 1000*10);

    test('schema fail (because name required)', async () => {
    
        const tc = new TypedConfig(generateUniqueFileName(location), undefined, configSchema);
        
        let error = false;
        try {
            await tc.set('age', 41);
        } catch(e) {
            error = true;
        }
        expect(error).toBe(true);
        expect(tc.getSync('age')).toBe(undefined);
    
    }, 1000*10);

    test('schema works because default provides name', async () => {
    
        const tc = new TypedConfig(generateUniqueFileName(location), defaultData, configSchema);
        
        let error = false;
        try {
            await tc.set('age', 42);
        } catch(e) {
            error = true;
        }
        expect(error).toBe(false);
        expect(tc.getSync('age')).toBe(42);
    
    }, 1000*10);

    test('default merge OK when setting dotprop', async () => {
    
        const tc = new TypedConfig(generateUniqueFileName(location), defaultNestedData, configSchema);
        
        const city = tc.getSync('location.city');
        expect(tc.getSync('location.city')).toBe('London');
        expect(tc.getSync('location.street')).toBe(undefined);

        await tc.set('location.city', 'York');
        expect(tc.getSync('location.city')).toBe('York');

        await tc.set('location.street', 'Shambles');
        expect(tc.getSync('location.street')).toBe('Shambles');
    
    }, 1000*10);

    test('default merge OK when setting dotprop with object', async () => {
    
        const tc = new TypedConfig(generateUniqueFileName(location), defaultNestedData, configSchema);
        

        await tc.set('location', {'street': 'Shambles'});
        expect(tc.getSync('location.city')).toBe(undefined);

        await tc.set('location.street', 'Shambles');
        expect(tc.getSync('location.street')).toBe('Shambles');
    
    }, 1000*10);

    test('default merge OK when merge with object', async () => {
    
        const tc = new TypedConfig(generateUniqueFileName(location), defaultNestedData, configSchema);

        const city = tc.getSync('location.city');
        if( city!=='London' ) debugger;
        expect(city).toBe('London');
        await tc.merge({
            location: {
                street: 'Mall'
            }
        })

        expect(tc.getSync('location.city')).toBe('London');

        expect(tc.getSync('location.street')).toBe('Mall');
    
    }, 1000*10);

    test('reset - default', async () => {
    
        const tc = new TypedConfig(generateUniqueFileName(location), defaultNestedData, configSchema);

        await tc.set('name', 'Bob');
        expect(tc.getSync('name')).toBe('Bob');

        await tc.reset();
        expect(tc.getSync('name')).toBe('Alice');
    
    }, 1000*10);

    test('reset - custom', async () => {
    
        const tc = new TypedConfig(generateUniqueFileName(location), defaultNestedData, configSchema);

        await tc.set('name', 'Bob');
        expect(tc.getSync('name')).toBe('Bob');

        await tc.reset({name: 'Rita'});
        expect(tc.getSync('name')).toBe('Rita');
    
    }, 1000*10);


    test('dispose lock', async () => {
    
        

        const tc = new TypedConfig(generateUniqueFileName(location), defaultData,  configSchema);

        await tc.set('name', 'Ayla');

        await tc.applyLock();

        
        await tc.dispose();

        
        const hasLock = await tc.testActiveLocks();
        expect(hasLock).toBe(false);
        
    }, 1000*5);



    test('lock disposes and can reconnect', async () => {
    
        const locationCustom = generateUniqueFileName(location);

        const tc = new TypedConfig(locationCustom, defaultData,  configSchema);

        await tc.set('name', 'Ayla');

        await tc.applyLock();

        const yieldPromise = new Promise<'complete' | 'timeout'>(async resolve => {
            const timer = setTimeout(() => {
                resolve('timeout');
            }, 1000);
            await tc.set('age', 1);
            resolve('complete');
            clearTimeout(timer);
        })

        const result = await yieldPromise;
        expect(result).toBe('timeout');

        await tc.dispose();

        const hasLock = await tc.testActiveLocks();
        expect(hasLock).toBe(false);

        const tc2 = new TypedConfig(locationCustom, defaultData,  configSchema);

        expect(await tc2.get('name')).toBe('Ayla');
        await tc2.set('age', 2);
        expect(await tc2.get('age')).toBe(2);

    }, 1000*5);



    test('two classes stay in sync', async () => {
    
        const locationCustom = generateUniqueFileName(location);

        const tc1 = new TypedConfig(locationCustom, defaultData,  configSchema);
        const tc2 = new TypedConfig(locationCustom, defaultData,  configSchema);

        
        await tc1.set('name', 'Ayla'); // Notice no await - it's get who should pause
        const name = await tc2.get('name');
        expect(name).toBe('Ayla');
        
        
    }, 1000*5);

})