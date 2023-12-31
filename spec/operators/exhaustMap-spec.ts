import { TestScheduler } from 'rxjs/testing';
import { concat, defer, Observable, of, BehaviorSubject } from 'rxjs';
import { exhaustMap, mergeMap, takeWhile, map, take } from 'rxjs/operators';
import { expect } from 'chai';
import { asInteropObservable } from '../helpers/interop-helper';
import { observableMatcher } from '../helpers/observableMatcher';

/** @test {exhaustMap} */
describe('exhaustMap', () => {
  let testScheduler: TestScheduler;

  beforeEach(() => {
    testScheduler = new TestScheduler(observableMatcher);
  });

  it('should map-and-flatten each item to an Observable', () => {
    testScheduler.run(({ cold, hot, expectObservable, expectSubscriptions }) => {
      const values = { x: 10, y: 30, z: 50 };
      const e1 = hot('   --1-----3--5-------|');
      const e1subs = '   ^------------------!';
      const e2 = cold('    x-x-x|            ', values);
      //                         x-x-x|
      //                            x-x-x|
      const expected = ' --x-x-x-y-y-y------|';

      const result = e1.pipe(exhaustMap((x) => e2.pipe(map((i) => i * +x))));

      expectObservable(result).toBe(expected, values);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should handle outer throw', () => {
    testScheduler.run(({ cold, expectObservable, expectSubscriptions }) => {
      const x = cold('  --a--b--c--|');
      const xsubs: string[] = [];
      const e1 = cold(' #   ');
      const e1subs = '  (^!)';
      const expected = '#   ';

      const result = e1.pipe(exhaustMap(() => x));

      expectObservable(result).toBe(expected);
      expectSubscriptions(x.subscriptions).toBe(xsubs);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should handle outer empty', () => {
    testScheduler.run(({ cold, expectObservable, expectSubscriptions }) => {
      const x = cold('  --a--b--c--|');
      const xsubs: string[] = [];
      const e1 = cold(' |   ');
      const e1subs = '  (^!)';
      const expected = '|   ';

      const result = e1.pipe(exhaustMap(() => x));

      expectObservable(result).toBe(expected);
      expectSubscriptions(x.subscriptions).toBe(xsubs);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should handle outer never', () => {
    testScheduler.run(({ cold, expectObservable, expectSubscriptions }) => {
      const x = cold('  --a--b--c--|');
      const xsubs: string[] = [];
      const e1 = cold(' -');
      const e1subs = '  ^';
      const expected = '-';

      const result = e1.pipe(exhaustMap(() => x));

      expectObservable(result).toBe(expected);
      expectSubscriptions(x.subscriptions).toBe(xsubs);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should raise error if project throws', () => {
    testScheduler.run(({ hot, expectObservable, expectSubscriptions }) => {
      const e1 = hot('  ---x---------y-----------------z-------------|');
      const e1subs = '  ^--!';
      const expected = '---#';

      const result = e1.pipe(
        exhaustMap(() => {
          throw 'error';
        })
      );

      expectObservable(result).toBe(expected);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should switch with a selector function', () => {
    testScheduler.run(({ cold, hot, expectObservable, expectSubscriptions }) => {
      const x = cold('     --a--b--c--|                               ');
      const xsubs = '   ---^----------!                               ';
      const y = cold('               --d--e--f--|                     ');
      const ysubs: string[] = [];
      const z = cold('                                 --g--h--i--|   ');
      const zsubs = '   -------------------------------^----------!   ';
      const e1 = hot('  ---x---------y-----------------z-------------|');
      const e1subs = '  ^--------------------------------------------!';
      const expected = '-----a--b--c---------------------g--h--i-----|';

      const observableLookup: Record<string, Observable<string>> = { x: x, y: y, z: z };

      const result = e1.pipe(exhaustMap((value) => observableLookup[value]));

      expectObservable(result).toBe(expected);
      expectSubscriptions(x.subscriptions).toBe(xsubs);
      expectSubscriptions(y.subscriptions).toBe(ysubs);
      expectSubscriptions(z.subscriptions).toBe(zsubs);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should switch inner cold observables, outer is unsubscribed early', () => {
    testScheduler.run(({ cold, hot, expectObservable, expectSubscriptions }) => {
      const x = cold('     --a--b--c--|                               ');
      const xsubs = '   ---^----------!                               ';
      const y = cold('               --d--e--f--|                     ');
      const ysubs: string[] = [];
      const z = cold('                                 --g--h--i--|   ');
      const zsubs = '   -------------------------------^--!           ';
      const e1 = hot('  ---x---------y-----------------z-------------|');
      const unsub = '   ----------------------------------!           ';
      const e1subs = '  ^---------------------------------!           ';
      const expected = '-----a--b--c---------------------g-           ';

      const observableLookup: Record<string, Observable<string>> = { x: x, y: y, z: z };

      const result = e1.pipe(exhaustMap((value) => observableLookup[value]));

      expectObservable(result, unsub).toBe(expected);
      expectSubscriptions(x.subscriptions).toBe(xsubs);
      expectSubscriptions(y.subscriptions).toBe(ysubs);
      expectSubscriptions(z.subscriptions).toBe(zsubs);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should not break unsubscription chains when result is unsubscribed explicitly', () => {
    testScheduler.run(({ cold, hot, expectObservable, expectSubscriptions }) => {
      const x = cold('     --a--b--c--|                               ');
      const xsubs = '   ---^----------!                               ';
      const y = cold('               --d--e--f--|                     ');
      const ysubs: string[] = [];
      const z = cold('                                 --g--h--i--|   ');
      const zsubs = '   -------------------------------^--!           ';
      const e1 = hot('  ---x---------y-----------------z-------------|');
      const e1subs = '  ^---------------------------------!           ';
      const expected = '-----a--b--c---------------------g-           ';
      const unsub = '   ----------------------------------!           ';

      const observableLookup: Record<string, Observable<string>> = { x: x, y: y, z: z };

      const result = e1.pipe(
        mergeMap((x) => of(x)),
        exhaustMap((value) => observableLookup[value]),
        mergeMap((x) => of(x))
      );

      expectObservable(result, unsub).toBe(expected);
      expectSubscriptions(x.subscriptions).toBe(xsubs);
      expectSubscriptions(y.subscriptions).toBe(ysubs);
      expectSubscriptions(z.subscriptions).toBe(zsubs);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should not break unsubscription chains with interop inners when result is unsubscribed explicitly', () => {
    testScheduler.run(({ cold, hot, expectObservable, expectSubscriptions }) => {
      const x = cold('     --a--b--c--|                               ');
      const xsubs = '   ---^----------!                               ';
      const y = cold('               --d--e--f--|                     ');
      const ysubs: string[] = [];
      const z = cold('                                 --g--h--i--|   ');
      const zsubs = '   -------------------------------^--!           ';
      const e1 = hot('  ---x---------y-----------------z-------------|');
      const e1subs = '  ^---------------------------------!           ';
      const expected = '-----a--b--c---------------------g-           ';
      const unsub = '   ----------------------------------!           ';

      const observableLookup: Record<string, Observable<string>> = { x: x, y: y, z: z };

      // This test is the same as the previous test, but the observable is
      // manipulated to make it look like an interop observable - an observable
      // from a foreign library. Interop subscribers are treated differently:
      // they are wrapped in a safe subscriber. This test ensures that
      // unsubscriptions are chained all the way to the interop subscriber.

      const result = e1.pipe(
        mergeMap((x) => of(x)),
        exhaustMap((value) => asInteropObservable(observableLookup[value])),
        mergeMap((x) => of(x))
      );

      expectObservable(result, unsub).toBe(expected);
      expectSubscriptions(x.subscriptions).toBe(xsubs);
      expectSubscriptions(y.subscriptions).toBe(ysubs);
      expectSubscriptions(z.subscriptions).toBe(zsubs);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should stop listening to a synchronous observable when unsubscribed', () => {
    const sideEffects: number[] = [];
    const synchronousObservable = concat(
      defer(() => {
        sideEffects.push(1);
        return of(1);
      }),
      defer(() => {
        sideEffects.push(2);
        return of(2);
      }),
      defer(() => {
        sideEffects.push(3);
        return of(3);
      })
    );

    of(null)
      .pipe(
        exhaustMap(() => synchronousObservable),
        takeWhile((x) => x != 2) // unsubscribe at the second side-effect
      )
      .subscribe(() => {
        /* noop */
      });

    expect(sideEffects).to.deep.equal([1, 2]);
  });

  it('should switch inner cold observables, inner never completes', () => {
    testScheduler.run(({ cold, hot, expectObservable, expectSubscriptions }) => {
      const x = cold('     --a--b--c--|                              ');
      const xsubs = '   ---^----------!                              ';
      const y = cold('               --d--e--f--|                    ');
      const ysubs: string[] = [];
      const z = cold('                                 --g--h--i-----');
      const zsubs = '   -------------------------------^-------------';
      const e1 = hot('  ---x---------y-----------------z---------|   ');
      const e1subs = '  ^----------------------------------------!   ';
      const expected = '-----a--b--c---------------------g--h--i-----';

      const observableLookup: Record<string, Observable<string>> = { x: x, y: y, z: z };

      const result = e1.pipe(exhaustMap((value) => observableLookup[value]));

      expectObservable(result).toBe(expected);
      expectSubscriptions(x.subscriptions).toBe(xsubs);
      expectSubscriptions(y.subscriptions).toBe(ysubs);
      expectSubscriptions(z.subscriptions).toBe(zsubs);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should handle a synchronous switch and stay on the first inner observable', () => {
    testScheduler.run(({ cold, hot, expectObservable, expectSubscriptions }) => {
      const x = cold('           --a--b--c--d--e--|   ');
      const xsubs = '   ---------^----------------!   ';
      const y = cold('           ---f---g---h---i--|  ');
      const ysubs: string[] = [];
      const e1 = hot('  ---------(xy)----------------|');
      const e1subs = '  ^----------------------------!';
      const expected = '-----------a--b--c--d--e-----|';

      const observableLookup: Record<string, Observable<string>> = { x: x, y: y };

      const result = e1.pipe(exhaustMap((value) => observableLookup[value]));

      expectObservable(result).toBe(expected);
      expectSubscriptions(x.subscriptions).toBe(xsubs);
      expectSubscriptions(y.subscriptions).toBe(ysubs);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should switch inner cold observables, one inner throws', () => {
    testScheduler.run(({ cold, hot, expectObservable, expectSubscriptions }) => {
      const x = cold('           --a--b--c--d--#             ');
      const xsubs = '   ---------^-------------!             ';
      const y = cold('                     ---f---g---h---i--');
      const ysubs: string[] = [];
      const e1 = hot('  ---------x---------y---------|       ');
      const e1subs = '  ^----------------------!             ';
      const expected = '-----------a--b--c--d--#             ';

      const observableLookup: Record<string, Observable<string>> = { x: x, y: y };

      const result = e1.pipe(exhaustMap((value) => observableLookup[value]));

      expectObservable(result).toBe(expected);
      expectSubscriptions(x.subscriptions).toBe(xsubs);
      expectSubscriptions(y.subscriptions).toBe(ysubs);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should switch inner hot observables', () => {
    testScheduler.run(({ hot, expectObservable, expectSubscriptions }) => {
      const x = hot('   -----a--b--c--d--e--|                  ');
      const xsubs = '   ---------^----------!                  ';
      const y = hot('   --p-o-o-p-------f---g---h---i--|       ');
      const ysubs: string[] = [];
      const z = hot('   ---z-o-o-m-------------j---k---l---m--|');
      const zsubs = '   --------------------^-----------------!';
      const e1 = hot('  ---------x----y-----z--------|         ');
      const e1subs = '  ^----------------------------!         ';
      const expected = '-----------c--d--e-----j---k---l---m--|';

      const observableLookup: Record<string, Observable<string>> = { x: x, y: y, z: z };

      const result = e1.pipe(exhaustMap((value) => observableLookup[value]));

      expectObservable(result).toBe(expected);
      expectSubscriptions(x.subscriptions).toBe(xsubs);
      expectSubscriptions(y.subscriptions).toBe(ysubs);
      expectSubscriptions(z.subscriptions).toBe(zsubs);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should switch inner empty and empty', () => {
    testScheduler.run(({ cold, hot, expectObservable, expectSubscriptions }) => {
      const x = cold('           |                    ');
      const y = cold('                     |          ');
      const xsubs = '   ---------(^!)                 ';
      const ysubs = '   -------------------(^!)       ';
      const e1 = hot('  ---------x---------y---------|');
      const e1subs = '  ^----------------------------!';
      const expected = '-----------------------------|';

      const observableLookup: Record<string, Observable<string>> = { x: x, y: y };

      const result = e1.pipe(exhaustMap((value) => observableLookup[value]));

      expectObservable(result).toBe(expected);
      expectSubscriptions(x.subscriptions).toBe(xsubs);
      expectSubscriptions(y.subscriptions).toBe(ysubs);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should switch inner empty and never', () => {
    testScheduler.run(({ cold, hot, expectObservable, expectSubscriptions }) => {
      const x = cold('           |                    ');
      const xsubs = '   ---------(^!)                 ';
      const y = cold('                     -          ');
      const ysubs = '   -------------------^          ';
      const e1 = hot('  ---------x---------y---------|');
      const e1subs = '  ^----------------------------!';
      const expected = '------------------------------';

      const observableLookup: Record<string, Observable<string>> = { x: x, y: y };

      const result = e1.pipe(exhaustMap((value) => observableLookup[value]));

      expectObservable(result).toBe(expected);
      expectSubscriptions(x.subscriptions).toBe(xsubs);
      expectSubscriptions(y.subscriptions).toBe(ysubs);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should never switch inner never', () => {
    testScheduler.run(({ cold, hot, expectObservable, expectSubscriptions }) => {
      const x = cold('           -                     ');
      const xsubs = '   ---------^                     ';
      const y = cold('                     #           ');
      const ysubs: string[] = [];
      const e1 = hot('  ---------x---------y----------|');
      const e1subs = '  ^-----------------------------!';
      const expected = '-------------------------------';

      const observableLookup: Record<string, Observable<string>> = { x: x, y: y };

      const result = e1.pipe(exhaustMap((value) => observableLookup[value]));

      expectObservable(result).toBe(expected);
      expectSubscriptions(x.subscriptions).toBe(xsubs);
      expectSubscriptions(y.subscriptions).toBe(ysubs);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should switch inner empty and throw', () => {
    testScheduler.run(({ cold, hot, expectObservable, expectSubscriptions }) => {
      const x = cold('           |                    ');
      const xsubs = '   ---------(^!)                 ';
      const y = cold('                     #          ');
      const ysubs = '   -------------------(^!)       ';
      const e1 = hot('  ---------x---------y---------|');
      const e1subs = '  ^------------------!          ';
      const expected = '-------------------#          ';

      const observableLookup: Record<string, Observable<string>> = { x: x, y: y };

      const result = e1.pipe(exhaustMap((value) => observableLookup[value]));

      expectObservable(result).toBe(expected);
      expectSubscriptions(x.subscriptions).toBe(xsubs);
      expectSubscriptions(y.subscriptions).toBe(ysubs);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should handle outer error', () => {
    testScheduler.run(({ cold, hot, expectObservable, expectSubscriptions }) => {
      const x = cold('           --a--b--c--d--e--|');
      const xsubs = '   ---------^---------!       ';
      const e1 = hot('  ---------x---------#       ');
      const e1subs = '  ^------------------!       ';
      const expected = '-----------a--b--c-#       ';

      const observableLookup: Record<string, Observable<string>> = { x: x };

      const result = e1.pipe(exhaustMap((value) => observableLookup[value]));

      expectObservable(result).toBe(expected);
      expectSubscriptions(x.subscriptions).toBe(xsubs);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should stop listening to a synchronous observable when unsubscribed', () => {
    const sideEffects: number[] = [];
    const synchronousObservable = new Observable<number>((subscriber) => {
      // This will check to see if the subscriber was closed on each loop
      // when the unsubscribe hits (from the `take`), it should be closed
      for (let i = 0; !subscriber.closed && i < 10; i++) {
        sideEffects.push(i);
        subscriber.next(i);
      }
    });

    synchronousObservable
      .pipe(
        exhaustMap((value) => of(value)),
        take(3)
      )
      .subscribe(() => {
        /* noop */
      });

    expect(sideEffects).to.deep.equal([0, 1, 2]);
  });

  it('should ignore subsequent synchronous reentrances during subscribing the inner sub', () => {
    const e = new BehaviorSubject(1);
    const results: Array<number> = [];

    e.pipe(
      take(3),
      exhaustMap(
        (value) =>
          new Observable<number>((subscriber) => {
            e.next(value + 1);
            subscriber.next(value);
          })
      )
    ).subscribe((value) => results.push(value));

    expect(results).to.deep.equal([1]);
  });
});
