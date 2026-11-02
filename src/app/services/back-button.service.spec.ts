import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { BackButtonService } from './back-button.service';

describe('BackButtonService', () => {
  let service: BackButtonService;

  beforeEach(() => {
    service = TestBed.inject(BackButtonService);
  });

  it('reports that nothing was closed with no closers', () => {
    expect(service.closeTopmost()).toBe(false);
  });

  it('tries the most recently registered closer first', () => {
    const calls: string[] = [];
    service.register(() => {
      calls.push('drawer');
      return true;
    });
    service.register(() => {
      calls.push('menu');
      return true;
    });

    expect(service.closeTopmost()).toBe(true);
    expect(calls).toEqual(['menu']);
  });

  it('falls through closers that had nothing open', () => {
    const drawer = vi.fn().mockName('drawer').mockReturnValue(true);
    service.register(drawer);
    service.register(() => false);

    expect(service.closeTopmost()).toBe(true);
    expect(drawer).toHaveBeenCalled();
  });

  describe('closeOnBack', () => {
    it('dismisses the sheet on back, and only until it is dismissed', () => {
      const dismissed = new Subject<void>();
      const ref = {
        dismiss: vi.fn().mockName('dismiss'),
        afterDismissed: () => dismissed.asObservable(),
      };
      service.closeOnBack(ref);

      expect(service.closeTopmost()).toBe(true);
      expect(ref.dismiss).toHaveBeenCalledTimes(1);

      dismissed.next();
      expect(service.closeTopmost()).toBe(false);
      expect(ref.dismiss).toHaveBeenCalledTimes(1);
    });
  });

  it('unregisters exactly the registration it came from', () => {
    const calls: string[] = [];
    const a = () => {
      calls.push('a');
      return true;
    };
    const b = () => {
      calls.push('b');
      return true;
    };
    service.register(a);
    service.register(b);
    const unregisterLastA = service.register(a);

    unregisterLastA();
    service.closeTopmost();

    expect(calls).toEqual(['b']);
  });

  it('stops calling a closer once unregistered', () => {
    const closer = vi.fn().mockName('closer').mockReturnValue(true);
    const unregister = service.register(closer);

    unregister();

    expect(service.closeTopmost()).toBe(false);
    expect(closer).not.toHaveBeenCalled();
  });
});
