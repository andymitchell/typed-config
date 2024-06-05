import { z } from 'zod';
import {TypedConfig} from '.';

async function main() {
    // The very basic approach
    const confBasic = new TypedConfig();
    await confBasic.set('dot.prop.path.to.value', 'hello world');
    const valueBasic = confBasic.getSync('dot.prop.path.to.value'); // 'hello world'

    // Customise location, to store in /<path-to-your-package>/config_store/confCustom.json
    const confCustomStore = new TypedConfig({type: 'file', file: 'confCustom.json', path_from_package_root: 'config_store'});

    // Make 'get' wait until any writes are complete on the file (i.e. lock file released)
    const confAwaitGet = new TypedConfig();
    await confAwaitGet.set('dot.prop.path.to.value', 'hello world');
    const valueAwaitGet = await confAwaitGet.get('dot.prop.path.to.value'); // 'hello world'

    // Let TypeScript hint/autocomplete/check your values
    const confTyped = new TypedConfig<{name: string}>();
    const valueTyped = confTyped.getSync('name'); // Path is now locked to 'name', per given type

    // Use a schema to check values at runtime (and auto infer type)
    const confSchemaBound = new TypedConfig(undefined, undefined, z.object({name: z.string()}));
    const valueSchemaBound = confSchemaBound.get('name'); // Path is locked to 'name'
    // EXPECT FAIL DUE TO NUMBER INSTEAD OF STRING: await confSchemaBound.set('name', 41);
    // EXPECT FAIL DUE TO UNKNOWN KEY: await confSchemaBound.set('other', 'Bob');
    await confSchemaBound.set('name', 'Bob');

    // Use defaults (useful for more complex schemas where values are required)
    const confSchemaBoundAndDefaultsFail = new TypedConfig(undefined, undefined, z.object({name: z.string(), age: z.number()}));
    confSchemaBoundAndDefaultsFail.set('age', 41); // EXPECT FAIL DUE TO NO NAME PROVIDED, BUT SCHEMA REQUIRES
    const confSchemaBoundAndDefaults = new TypedConfig(undefined, {name: 'Alice', age: 40}, z.object({name: z.string(), age: z.number()}));
    confSchemaBoundAndDefaults.set('age', 41); // Works because name was set in default
}