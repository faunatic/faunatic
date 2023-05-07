import { z } from "zod";
import faunadb from "faunadb";
import { LogCTX } from "./utils";
import deepmerge from "ts-deepmerge";


const { Client: FaunaClient, query } = faunadb;

/**
 * Faunatic is a mini-ORM / wrapper around Fauna to improve the developer experience. The goal is to be able to set up a massive-scale database
 * in minutes with familiar CRUD syntax and operations.
 */
export namespace faunatic {
    /**
     * Exporting certain types coming from Fauna / for Fauna directly.
     */
    export namespace Fauna {
        export type Expr = faunadb.Expr;
        export type Ref = {
            id: string;
            database?: Ref;
            collection?: Ref;
        };
        export type Set = {}
        export type IndexTermObject = {
            field: string;
            unique?: boolean;
        };
        export type IndexValueObject = {
            field: string[];
            reverse?: boolean;
        };
        export type PaginateOptions = {
            after?: any;
            before?: any;
            size?: number;
        };
        export type FaunaMapResult<T> = {
            data: T[];
            after?: any | null;
            before?: any | null;
        };
        export type Timestamp = any;
        export type TTL = any;
        export type RawDocumentUntyped = {
            ref: Ref;
            ts: number;
            data: unknown;
            ttl?: TTL;
        };
    }

    export type HandleObj<D extends any, R extends any> = (data: D) => R;
    export type IndexPickedTermVar = boolean | {
        unique?: boolean;
    };
    export type IndexPickedValueVar = boolean | {
        reverse?: boolean;
    };
    export type IndexValueObj<D extends any> = {
        field: HandleObj<D, any>;
        reverse?: boolean;
    };
    export type IndexDefinition<Data extends any> = {
        unique?: boolean;
        terms?: HandleObj<Data, any>[];
        values?: IndexValueObj<Data>[];
        serialized?: boolean;
        data?: any;
    };
    type RelationHandle<T> = () => T;
    export type RelationDefinition<
        Data,
        Rel = RelationHandle<FaunaticModel<any> | FaunaticModel<any>[]>
    > = {
        field: HandleObj<Data, string | string[]>;
        relatedModel: Rel;
    };

    export type Subset<K> = {
        [attr in keyof K]?: K[attr] extends object ? Subset<K[attr]> : K[attr];
    };

    export type SubsetPick<K, V extends (IndexPickedValueVar | IndexPickedTermVar | any)> = {
        [attr in keyof K]?: K[attr] extends object ? SubsetPick<K[attr], V> : V;
    };

    export type RawDocument<S extends DefinedSchema<any>, T extends SchemaTypes<S> = SchemaTypes<S>> = Fauna.RawDocumentUntyped & {
        data: T["inp"];
    };

    export type SerializedDocument<S extends DefinedSchema<any>, T extends SchemaTypes<S> = SchemaTypes<S>> = { id: string; } & T["out"];

    /**
     * Retrieves the element type from an array input
     */
    export type ArrayT<T extends any[]> = T extends (infer U)[] ? U : never;

    type Id = Fauna.Ref | string;
    export const fql = query;
    type ClientOptions = {
        debug?: boolean;
        secret: string;
    };
    type SchemaTypes<S extends DefinedSchema<any>> = {
        inp: z.input<S["schema"]>;
        out: z.infer<S["schema"]>;
    };

    const convertObj = <H extends HandleObj<any, any>> (path: H): string[] => {
        const indexPath: string[] = [];
        const handler: ProxyHandler<any> = {
            get: (target, key) => {
                indexPath.push(key.toString());
                return new Proxy(() => {
                }, handler);
            }
        };
        path(
            new Proxy(() => {
            }, handler)
        );
        return indexPath;
    };

    export const MetaSchema = z.object({
        _: z.object({
            version: z.string()
                .default("1"),
            createdAt: z.number()
                .int()
                .default(Date.now()),
            updatedAt: z.number()
                .int()
                .default(Date.now())
        })
            .default({})
    });


    export class DefinedSchema<
        InputSchema extends z.AnyZodObject,
        Inp extends z.input<InputSchema> = z.input<InputSchema>,
        Out extends z.infer<InputSchema> = z.infer<InputSchema>
    > {
        public schema: InputSchema;
        public arraySchema: z.ZodArray<InputSchema>;
        public __inp = {} as Inp;
        public __out = {} as Out;

        constructor (
            inputSchema: InputSchema
        ) {
            this.schema = inputSchema;
            this.arraySchema = this.schema.array();
        }

        parseSync (inp: Inp | Out): Out {
            return this.schema.parse(inp) as Out;
        }

        parse (inp: Inp | Out): Promise<Out> {
            return this.schema.parseAsync(inp) as Promise<Out>;
        }

        parseBulkSync (inp: (Inp | Out)[]): Out[] {
            return this.arraySchema.parse(inp) as Out[];
        }

        parseBulk (inp: (Inp | Out)[]): Promise<Out[]> {
            return this.arraySchema.parseAsync(inp) as Promise<Out[]>;
        }
    }


    /**
     * This is the faunatic Client used for setting up the given models and indexes. Construct the client.
     * @example
     * const client = new faunatic.Client({ secret: "my-secret" });
     */
    export class Client {
        public faunaClient: typeof FaunaClient.prototype;
        public debug = false;

        constructor (public options: ClientOptions) {
            this.faunaClient = new FaunaClient({
                secret: options.secret
            });
            this.debug = options.debug || false;
        }

        query (expr: Fauna.Expr, options?: any) {
            return this.faunaClient.query(expr, options);
        }

        queryWithMetrics (expr: Fauna.Expr, options?: any) {
            return this.faunaClient.query(expr, options);
        }

        /**
         * The .init() function accepts an array of the models that should be initiated with this client and be set up properly
         * If the "setup" flag is set to true, it will also upsert (create if not exist) the required collections/indexes.
         */
        async init (models: FaunaticModel<any>[], setup = false) {
            const createModels: Fauna.Expr[] = [];
            const createIndexes: Fauna.Expr[] = [];

            for (let model of models) {
                // Setting the client to this
                model._setClient(this);
                model.log.consoleLog = this.debug;

                const coll = model._coll();
                const indexQueries = model.index.createQueries("create", coll);
                const collQuery = fql.Let({
                    name: model.name,
                    exists: fql.Exists(fql.Collection(fql.Var("name"))),
                    createdModel: fql.If(
                        fql.Var("exists"),
                        null,
                        model._createColl()
                    )
                }, fql.Var("createdModel"));

                // Pushing the queries
                createIndexes.push(...indexQueries);
                createModels.push(collQuery);
            }


            // console.log(createModels);
            // console.log(createIndexes);
            // console.log(`Successfully prepared ${ createModels.length } model creation queries, and ${ createIndexes.length } index creation queries!`);

            const modelSetup = await this.faunaClient.query(
                fql.Do(
                    true,
                    ...createModels
                )
            );

            const indexSetup = await this.faunaClient.query(
                fql.Do(
                    true,
                    ...createIndexes
                )
            );

            console.log(`Done!`);
        }
    }


    export class BuiltDocument<
        S extends DefinedSchema<z.AnyZodObject>,
        T extends SchemaTypes<S> = SchemaTypes<S>
    > {
        public data: T["out"];
        public raw: RawDocument<S>;
        public ref: Fauna.Ref;
        public id: string;
        public ttl?: Fauna.TTL;
        public ts: number;
        public meta?: any;

        constructor (
            public model: FaunaticModel<S, T, any>,
            public schema: S,
            input: {
                data: T["inp"];
                rawDocument: RawDocument<S>;
            }
        ) {
            this.raw = input.rawDocument;
            this.data = input.data;
            this.ref = this.raw.ref;
            this.id = this.ref.id;
            this.ts = this.raw.ts;
            this.ttl = this.raw.ttl;
            this.meta = {};
        }

        /**
         * Converts the document into a "serialized" form
         */
        serialize (): SerializedDocument<S> {
            return (
                {
                    id: this.id,
                    ...structuredClone(this.data)
                }
            );
        }

        /**
         * Builds (does not update nor replace data in Fauna) data based on selective input
         */
        public buildUpdate (data: Subset<T["inp"]>): Promise<T["out"]> {
            const mergedData = deepmerge.withOptions({ mergeArrays: false }, this.data, data);
            return this.model.build(mergedData);
        }

        /**
         * (Sync) Builds (does not update nor replace data in Fauna) data based on selective input
         * @param data
         */
        public buildUpdateSync (data: Subset<T["inp"]>): T["out"] {
            const merged = deepmerge.withOptions({ mergeArrays: false }, this.data, data);
            return this.model.buildSync(data);
        }

        /**
         * Builds and updates document partially based on the updated fields
         */
        public pickUpdate (data: Subset<T["inp"]>) {
            const cloned = structuredClone(this.data);
            const merged = deepmerge.withOptions({ mergeArrays: false }, cloned, data);
            return this.model.update(this.id, merged);
        }

        /**
         * Builds the document based on the input data and REPLACES the entire document with the new data. All fields that are not included will be removed
         */
        async replace (data: T["out"] | T["inp"]) {
            const builtReplacement = await this.model.build(data);
            return this.model.replace(this.id, builtReplacement);
        }

        /**
         * Deletes the document from Fauna
         */
        public delete () {
            return this.model.delete(this.id);
        }

        /**
         * Retrieves a new version of the document (if any)
         */
        public refresh () {
            return this.model.get(this.id);
        }
    }


    /**
     * The IndexManager is responsible for getting index definition input and being able to generate creation queries for the indexes.
     * It's also used to help with writing FQL4 queries, for example by calling model.index.match(<indexName>, ...<terms>) which returns a Match() FQL
     * expression.
     */
    export class IndexManager<Defs extends Record<string, IndexDefinition<any>>> {
        public model: FaunaticModel<any> | null = null;

        constructor (
            public definitions: Defs
        ) {
        }

        setModel (model: FaunaticModel<any>) {
            this.model = model;
        }

        get<N extends keyof Defs> (name: N): Defs[N] {
            return this.definitions[name];
        }

        fullIndexName<N extends keyof Defs> (name: N): string {
            if (!this.model) {
                throw new Error(`Attempted to retrieve full index name before model was set for the index manager!`);
            }

            const model = this.model;
            return `${ model.name }-${ name as string }`;
        }

        createIndex<N extends keyof Defs> (name: N, coll: Fauna.Expr) {
            const fullName = this.fullIndexName(name);
            const def = this.definitions[name];
            const termPaths: string[][] = (def.terms?.map(path => {
                if (path instanceof Function) {
                    return convertObj(path);
                }

                return [ path ];
            }) ?? []);

            const valueFields: Fauna.IndexValueObject[] = def?.values?.map(val => {
                let paths: string[] = [];

                if (val.field instanceof Function) {
                    paths = convertObj(val.field);
                } else {
                    paths = [ val.field ];
                }

                return {
                    field: paths,
                    reverse: val.reverse || false
                };
            }) ?? [];

            const rawQuery = fql.CreateIndex({
                name: fullName,
                source: coll,
                terms: termPaths.map(p => ({
                    field: p
                })),
                values: valueFields,
                unique: def?.unique,
                serialized: def?.serialized,
                data: def?.data
            });
            console.log(rawQuery);

            return {
                fullName,
                rawQuery
            };
        }

        createQueries (type = "create", coll: Fauna.Expr) {
            const queries: Fauna.Expr[] = [];
            const entries = Object.entries(this.definitions);

            for (let entry of entries) {
                const [ name, index ] = entry;
                const query = fql.Let({
                    name: this.fullIndexName(name),
                    exists: fql.Exists(fql.Index(fql.Var("name"))),
                    createdIndex: fql.If(
                        fql.Var("exists"),
                        null,
                        this.createIndex(name, coll)
                    )
                }, fql.Var("createdIndex"));

                queries.push(query);
            }

            return queries;
        }

        match<N extends keyof Defs> (indexName: N, ...terms: any[]) {
            return fql.Match(
                fql.Index(this.fullIndexName(indexName)),
                ...terms
            );
        }
    }


    export class RelationManager<
        Rels extends Record<string, RelationDefinition<any>>
    > {
        constructor (public relations: Rels) {
        }

        getRelation<N extends keyof Rels> (name: N) {

        }

        getRelationData<
            N extends keyof Rels,
            RM extends Rels[N]["relatedModel"],
            RT extends ReturnType<RM>,
            RT2 extends RT extends any[] ? ArrayT<RT> : RT,
            R extends RT2["definedSchema"],
            T extends SchemaTypes<R>
        > (name: N): T["out"] {
            return {} as T["out"];
        }
    }


    export class FaunaticModel<
        S extends DefinedSchema<z.AnyZodObject>,
        T extends SchemaTypes<S> = SchemaTypes<S>,
        I extends IndexManager<any> = IndexManager<any>,
        R extends RelationManager<any> = RelationManager<any>,
        RawDoc extends RawDocument<S> = RawDocument<S>,
        Doc extends BuiltDocument<S, T> = BuiltDocument<S, T>
    > {
        public client: Client | null = null;
        public fql = fql;
        public log: LogCTX;

        constructor (
            public name: string,
            public definedSchema: S,
            public index: I,
            public relation: R
        ) {
            this.log = new LogCTX(`faunatic:model:${ this.name }`, {
                name: this.name
            });
            this.index.setModel(this);
        }


        // == INTERNAL HELPERS == //
        _setClient (client: Client) {
            this.client = client;
        }

        _coll () {
            return fql.Collection(this.name);
        }

        _ref (id: Id) {
            if (typeof id === "string") {
                return fql
                    .Ref(this._coll(), id);
            }

            return fql
                .Ref(id.collection!.id!, id.id);
        }

        _err (message: string, meta = {}) {
            throw new Error(`[Model "${ this.name }"]: ${ message } - ${ JSON.stringify(meta) }`);
        }

        _createColl () {
            const rawQuery = fql.CreateCollection({
                name: this.name,
                data: {},
                history_days: null,
                ttl_days: null
            });

            return {
                name: this.name,
                rawQuery
            };
        }

        // == BUILDING UTILS == //
        /**
         * Builds a fully-valid data representation of the provided schema. It's using zod for validation of the provided input.
         */
        public build (inp: T["inp"] | T["out"]): Promise<T["out"]> {
            return this.definedSchema.parse(inp);
        }

        /**
         * Builds fully-valid data representation of the schema in bulk
         */
        public buildBulk (inp: (T["inp"] | T["out"])[]): Promise<T["out"][]> {
            return this.definedSchema.parseBulk(inp);
        }

        /**
         * (Sync) Builds fully-valid data representation of the schema
         */
        public buildSync (inp: T["inp"] | T["out"]): T["out"] {
            return this.definedSchema.parseSync(inp);
        }

        /**
         * (Sync) Builds fully-valid data representation of the schema in bulk
         * @param inp
         */
        public buildBulkSync (inp: (T["inp"] | T["out"])[]): T["out"][] {
            return this.definedSchema.parseBulkSync(inp);
        }

        /**
         * Builds a raw Fauna document into a fully-valid representation of the data schema
         */
        public async buildDoc (raw: RawDoc): Promise<Doc> {
            const builtData = await this.build(raw.data);

            return new BuiltDocument(this, this.definedSchema, {
                data: builtData,
                rawDocument: raw
            }) as Doc;
        }

        /**
         * (Sync) Builds a raw Fauna document into a fully-valid representation of the data schema
         */
        public buildDocSync (raw: RawDoc): Doc {
            const builtData = this.buildSync(raw.data);

            return new BuiltDocument(this, this.definedSchema, {
                data: builtData,
                rawDocument: raw
            }) as Doc;
        }

        /**
         * Builds bulk Fauna documents into fully-valid representation of the data schema
         */
        public async buildBulkDocs (raw: RawDoc[]): Promise<Doc[]> {
            return await (Promise.all(
                raw.map((doc) => this.buildDoc(doc))
            ));
        }

        public buildBulkDocsSync (raw: RawDoc[]): Doc[] {
            return raw.map(doc => this.buildDocSync(doc));
        }

        public async buildMapResult<
            MapResult extends Fauna.FaunaMapResult<any>,
            Out extends { after: any | null; before: any | null; data: Doc[] }
        > (result: MapResult): Promise<Out> {
            const builtBulk = await this.buildBulkDocs(result.data);

            return {
                after: result.after || null,
                before: result.before || null,
                data: builtBulk
            } as Out;
        }

        // == CRUD OPERATIONS == //

        /**
         * Retrieves a single document (or null if it does not exist).
         */
        public async get (id: Id): Promise<Doc | null> {
            const q = this.fql;
            const getQuery = q.Let({
                ref: this._ref(id),
                exists: q.Exists(q.Var("ref")),
                doc: q.If(
                    q.Var("exists"),
                    q.Get(q.Var("ref")),
                    null
                )
            }, q.Var("doc"));
            this.log.debug(`Called to retrieve document by id: ${ id }, generated query!`, { rawQuery: getQuery });
            const queried = await this.execute<RawDoc | null>(getQuery);

            if (!queried) {
                return null;
            }

            return this.buildDoc(queried);
        }

        /**
         * Retrieves a document by the provided id/ref. If no document is found, it throws an error
         */
        public getOrThrow (id: Id): Promise<Doc> {
            return this.get(id)
                .then(r => {
                    if (!r) {
                        throw new Error(`[Model ${ this.name }]: Expected document with id ${ id } to be present!`);
                    }

                    return r;
                });
        }

        /**
         * Retrieves the documents by the provided ids/refs. If a document is not found, it will not be included in the response
         */
        public getMany (ids: Id[]): Promise<Doc[]> {
            const q = this.fql;
            const rawQuery = q.Let({
                ids,
                docs: q.Map(
                    q.Var("ids"),
                    q.Lambda("id", q.Let({
                        ref: q.Ref(this._coll(), q.Var("id")),
                        exists: q.Exists(q.Var("ref")),
                        doc: q.If(
                            q.Var("exists"),
                            q.Get(q.Var("ref")),
                            null
                        )
                    }, q.Var("doc")))
                )
            }, q.Var("docs"));

            this.log.debug(`Called to retrieve a total of ${ ids.length } documents!`, { rawQuery });
            return this.execute<(RawDoc | null)[]>(rawQuery)
                .then(r => {
                    const filteredResult = r.filter(d => d !== null) as RawDoc[];
                    return this.buildBulkDocs(filteredResult);
                });
        }

        /**
         * Retrieves all the documents by the provided ids/refs. If at least one document is not found it throws an error (all documents must exist).
         */
        public getManyOrThrow (ids: Id[]): Promise<Doc[]> {
            return this.getMany(ids)
                .then(r => {
                    const mismatchLength = r.length !== ids.length;
                    if (mismatchLength) {
                        this._err(`Mismatch for .getManyOrThrow() between provided ids and returned documents - this means a document id is invalid!`);
                    }

                    return r;
                });
        }

        /**
         * Updates a single document by its id/ref
         */
        public update (id: Id, data: T["out"]): Promise<Doc | null> {
            const q = this.fql;
            const rawQuery = q.Let({
                ref: this._ref(id),
                exists: q.Exists(q.Var("ref")),
                data,
                updated: q.Update(
                    q.Var("ref"),
                    q.Var("data")
                )
            }, q.Var("updated"));

            return this.execute<RawDoc | null>(rawQuery)
                .then(r => {
                    if (!r) {
                        return null;
                    }

                    return this.buildDoc(r);
                });
        }

        /**
         * Updates many documents by their ids/refs.
         * @param docs
         */
        public updateMany (docs: { id: Id; data: T["out"] }[]): Promise<Doc[]> {
            const q = this.fql;
            const rawQuery = q.Let({
                docs,
                updated: q.Map(
                    q.Var("docs"),
                    q.Lambda("doc", q.Let({
                        ref: q.Ref(this._coll(), q.Select("id", q.Var("doc"))),
                        data: q.Select("data", q.Var("doc")),
                        exists: q.Exists(q.Var("ref")),
                        updated: q.Update(
                            q.Var("ref"),
                            { data: q.Var("data") }
                        )
                    }, q.Var("updated")))
                )
            }, q.Var("updated"));

            return this.execute<(RawDoc | null)[]>(rawQuery)
                .then(r => {
                    const filteredRes = r.filter(e => e !== null) as RawDoc[];
                    return this.buildBulkDocs(filteredRes);
                });
        }

        /**
         * Replaces a single document entirely by the new data
         */
        public replace (id: Id, data: T["out"]): Promise<Doc | null> {
            const q = this.fql;
            const rawQuery = q.Let({
                ref: this._ref(id),
                data,
                exists: q.Exists(q.Var("ref")),
                replaced: q.Replace(
                    q.Var("ref"),
                    {
                        data: q.Var("data")
                    }
                )
            }, q.Var("replaced"));

            return this.execute<RawDoc | null>(rawQuery)
                .then(r => {
                    if (!r) {
                        return null;
                    }

                    return this.buildDoc(r);
                });
        }

        /**
         * Replaces many documents entirely by the new data provided.
         */
        public replaceMany (docs: { id: Id; data: T["out"] }[]): Promise<Doc[]> {
            const q = this.fql;
            const rawQuery = q.Let({
                docs,
                replaced: q.Map(
                    q.Var("docs"),
                    q.Lambda("doc", q.Let({
                        ref: q.Ref(this._coll(), q.Select("id", q.Var("doc"))),
                        exists: q.Exists(q.Var("ref")),
                        upd: q.If(
                            q.Var("exists"),
                            q.Replace(
                                q.Var("ref"),
                                {
                                    data: q.Select("data", q.Var("doc"))
                                }
                            ),
                            null
                        )
                    }, q.Var("upd")))
                )
            }, q.Var("replaced"));

            return this.execute<(RawDoc | null)[]>(rawQuery)
                .then(r => {
                    const filteredResult = r.filter(x => x !== null) as RawDoc[];
                    return this.buildBulkDocs(filteredResult);
                });
        }

        /**
         * Deletes the given document by its id/ref.
         */
        public delete (id: Id): Promise<Doc | null> {
            const q = this.fql;
            const rawQuery = q.Let({
                ref: this._ref(id),
                exists: q.Exists(q.Var("ref")),
                deleted: q.If(
                    q.Var("exists"),
                    q.Delete(q.Var("ref")),
                    q.Abort("No document to delete!")
                )
            }, q.Var("deleted"));

            return this.execute<RawDoc | null>(rawQuery)
                .then(r => {
                    if (!r) {
                        return null;
                    }

                    return this.buildDoc(r);
                });
        }

        /**
         * Deletes many documents by their ids/refs.
         */
        public delMany (ids: Id[]): Promise<Doc[]> {
            const q = this.fql;
            const rawQuery = q.Let({
                ids,
                deleted: q.Map(
                    q.Var("ids"),
                    q.Lambda("id", q.Let({
                        ref: q.Ref(this._coll(), q.Var("id")),
                        exists: q.Exists(q.Var("ref")),
                        del: q.If(
                            q.Var("exists"),
                            q.Delete(q.Var("ref")),
                            null
                        )
                    }, q.Var("del")))
                )
            }, q.Var("deleted"));

            return this.execute<(RawDoc | null)[]>(rawQuery)
                .then(r => {
                    const filteredResult = r.filter(e => e !== null) as RawDoc[];
                    return this.buildBulkDocs(filteredResult);
                });
        }

        /**
         * Creates a single document in the given collection with the data provided
         */
        public create (data: T["out"] | T["inp"], docExtra: any = null): Promise<Doc> {
            const q = this.fql;
            const rawQuery = q.Let({
                data,
                doc: q.Create(
                    this._coll(),
                    {
                        data: q.Var("data")
                    }
                )
            }, q.Var("doc"));

            return this.execute<RawDoc>(rawQuery)
                .then(r => this.buildDoc(r));
        }

        /**
         * Creates many documents in the given collection with the data provided.
         */
        public createMany (docs: { data: T["out"]; docExtra?: any; }[], docExtra: any = null): Promise<Doc[]> {
            const q = this.fql;
            const rawQuery = q.Let({
                docs,
                created: q.Map(
                    q.Var("docs"),
                    q.Lambda("doc", q.Let({
                        data: q.Select("data", q.Var("doc")),
                        doc: q.Create(
                            this._coll(),
                            {
                                data: q.Var("data")
                            }
                        )
                    }, { doc: q.Var("doc") }))
                )
            }, q.Var("created"));

            return this.execute<{ doc: RawDoc; }[]>(rawQuery)
                .then(r => {
                    const mappedDocuments = r.map(e => e.doc);
                    return this.buildBulkDocs(mappedDocuments);
                });
        }

        public async list (size = 100, options: { after?: any; before?: any } = {}) {
            const q = this.fql;
            const rawQuery = q.Let({
                size,
                after: options.after,
                before: options.before,
                options,
                result: q.Map(
                    q.Paginate(
                        q.Documents(this._coll()),
                        {
                            size: q.Var("size"),
                            after: options?.after ? options.after : undefined,
                            before: options?.before ? options.before : undefined
                        }
                    ),
                    q.Lambda("ref", q.Get(q.Var("ref")))
                )
            }, q.Var("result"));

            let r = await this.execute<Fauna.FaunaMapResult<RawDoc>>(rawQuery);
            const builtDocuments = await this.buildBulkDocs(r.data);

            return {
                data: builtDocuments as Doc[],
                after: r.after || null,
                before: r.before || null
            };
        }

        public async count (maxDocs = 10000): Promise<number> {
            const q = this.fql;
            const rawQuery = q.Let({
                maxDocs,
                result: q.Count(
                    q.Paginate(
                        q.Documents(this._coll()),
                        {
                            size: q.Var("maxDocs")
                        }
                    )
                ),
                counted: q.Select([ "data", 0 ], q.Var("result"))
            }, q.Var("counted"));

            return this.execute<number>(rawQuery);
        }

        // == PUBLIC FUNCTIONS == //

        paginate (size = 100, after?: any, before?: any): Fauna.PaginateOptions {
            return {
                size,
                after,
                before
            };
        }

        getFirstByIndex<N extends keyof I["definitions"]> (indexName: N, ...terms: any[]): Promise<Doc | null> {
            const matchedIndex = this.index.match(indexName, ...terms);
            const raw = fql.Let({
                indexName,
                matched: matchedIndex,
                found: fql.If(
                    fql.Exists(fql.Var("matched")),
                    fql.Get(fql.Var("matched")),
                    null
                )
            }, fql.Var("found"));

            return this.execute<RawDoc | null>(raw)
                .then(r => {
                    if (!r) {
                        return null;
                    }

                    return this.buildDoc(r);
                });
        }

        listByIndex<N extends keyof I["definitions"]> (indexName: N, terms: any[], pagination: Fauna.PaginateOptions = {}) {
            const matchedIndex = this.index.match(indexName, ...terms);
            const raw = fql.Let({
                indexName,
                matchedIndex,
                pagination,
                listed: fql.Map(
                    fql.Paginate(
                        fql.Var("matchedIndex"),
                        {
                            size: 100,
                            ...pagination
                        }
                    ),
                    fql.Lambda("ref", fql.Get(fql.Var("ref")))
                )
            }, fql.Var("listed"));

            return this.execute<Fauna.FaunaMapResult<S>>(raw)
                .then(r => this.buildMapResult(r));
        }

        public async execute<ExpectedResponse = any> (rawQuery: Fauna.Expr, options: {
            queryOptions?: any;
            withMetrics?: boolean;
            errorOnFailure?: boolean;
        } = { errorOnFailure: true }): Promise<ExpectedResponse> {
            if (!this.client) {
                this._err(`Attempted to call .execute(), but no client has been initiated!`);
            }

            this.log.debug(`Executing provided query. With metrics: ${ options.withMetrics || false }, error on failure: ${ options.errorOnFailure }.`, {
                queryOptions: options?.queryOptions,
                rawQuery
            });

            let executedQuery;

            if (!options.withMetrics) {
                executedQuery = await this.client!.query(
                    rawQuery,
                    options?.queryOptions ?? {}
                )
                    .catch(e => e);
            } else {
                executedQuery = await this.client!.queryWithMetrics(
                    rawQuery,
                    options?.queryOptions ?? {}
                )
                    .catch(e => e);
            }

            if (executedQuery instanceof Error) {
                this.log.error(`An error occurred while executing the query!`, {
                    err: executedQuery
                });

                if (options.errorOnFailure) {
                    throw executedQuery;
                }
            }

            this.log.debug(`Response for query`, { response: executedQuery });

            return executedQuery as ExpectedResponse;
        }

        // == INTERNAL FUNCTIONS == //
        public toString (): string {
            return `[FaunaticModel: "${ this.name }"]`;
        }

        public toJSON (): any {
            return JSON.stringify({
                model: this.name
            });
        }
    }


    type RelationFunc<M extends FaunaticModel<any, any, any, any>> = () => M;

    export function simpleModel<
        ModelName extends string,
        DefS extends DefinedSchema<any>,
        T extends SchemaTypes<DefS>
    > (name: ModelName, definedSchema: DefS) {
        const mod = new FaunaticModel(
            name,
            definedSchema,
            new IndexManager({}),
            new RelationManager({})
        );

        return mod;
    }

    export function model<
        ModelName extends string,
        DefS extends DefinedSchema<any, any>,
        T extends SchemaTypes<DefS>,
        Ind extends Record<string, IndexDefinition<RawDocument<DefS>>>,
        IndM extends IndexManager<Ind>,
        BDoc extends BuiltDocument<DefS>,
        Rels extends Record<string, RelationDefinition<RawDocument<DefS>>>,
        RelsM extends RelationManager<Rels>,
        Mod extends FaunaticModel<DefS, T, IndM, RelsM>
    > (options: { name: ModelName; schema: DefS; indexes?: Ind; relations?: Rels; }): Mod {
        const indexManager = new IndexManager<Ind>(options.indexes ?? {} as Ind) as IndM;
        const relationManager = new RelationManager<Rels>(options.relations ?? {} as Rels) as RelsM;

        const mod = new FaunaticModel<DefS, T, IndM, RelsM>(
            options.name,
            options.schema,
            indexManager,
            relationManager
        ) as Mod;

        return mod;
    }
}
