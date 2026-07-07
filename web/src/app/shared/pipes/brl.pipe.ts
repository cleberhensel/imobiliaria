import { Pipe, PipeTransform } from '@angular/core';
import { formatBrl } from '../../core/utils/format.util';

@Pipe({ name: 'brl', standalone: true })
export class BrlPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatBrl(value);
  }
}
