/*import { Fauna, faunatic } from "./faunatic";


export namespace query {
    import fql = faunatic.fql;


    export class Entry<Out, Expression extends Fauna.Expr = Fauna.Expr> {
        public __out = {} as Out;

        constructor (public expression: Expression) {
        }

        toFQL () {
            return this.expression;
        }
    }

    export class SimpleQueryBuilder {
        map<
            DT extends any[],
            T extends DT extends any[] ? faunatic.ArrayT<DT> : DT,
            Handler extends ((v: T) => any),
            R extends ReturnType<Handler>
        > (data: DT, handler: Handler) {
            return new Entry<R>(
                fql.Map(
                    data,
                    fql.Lambda("v", handler)
                )
            );
        }

        if<
            C extends FQLOrPrim<boolean>,
            T extends any,
            E extends any
        > (_condition: C, _then: T, _else: E) {
            const cond = convertPrimitiveOrEntry(_condition);
            const the = convertPrimitiveOrEntry(_then);
            const els = convertPrimitiveOrEntry(_else);

            return new Entry<InferFQL<T> | InferFQL<E>>(
                fql.If(
                    cond.toFQL(),
                    the.toFQL(),
                    els.toFQL()
                )
            );
        }

        match (index: string, ...terms: any) {
            return new Entry(
                fql.Match(
                    fql.Index(index),
                    ...terms
                )
            );
        }

        create<T extends object, Doc extends FaunaTypes.RawDocumentTyped<T> = FaunaTypes.RawDocumentTyped<T>> (ref: any, data: T, extra?: any) {
            return new Entry<Doc>(
                fql.Create(
                    ref,
                    {
                        data
                    }
                )
            );
        }

        get<T extends any, Doc = faunatic.RawDocument<any>> (collection: string, id: string) {
            return new Entry<Doc | null>(
                fql.Let({
                    ref: fql.Ref(fql.Collection(collection), id),
                    exists: fql.Exists(fql.Var("ref")),
                    doc: fql.If(
                        fql.Var("exists"),
                        fql.Get(fql.Var("ref")),
                        null
                    )
                }, fql.Var("doc"))
            );
        }

        select<
            Inp extends any,
            K extends string
        > (inp: Inp, p: K) {
            return new Entry(
                fql.Select(
                    p.split("."),
                    inp as any
                )
            );
        }

        var<T> (name: string) {
            return new Entry<T>(
                fql.Var(name)
            );
        }
    }
}
*/
