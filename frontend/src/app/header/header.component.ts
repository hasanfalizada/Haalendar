import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { AppComponent } from '../app.component';
import { DateproviderService } from '../dateprovider.service';
import { FormControl } from '@angular/forms';
import { Observable, Subscription, fromEvent } from 'rxjs';
import { startWith, map, filter, take } from 'rxjs/operators';
import { DataproviderService } from '../dataprovider.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit {

  searchControl = new FormControl();
  searchItems: Observable<any>;
  events: any = [];
  sub: Subscription;
  @ViewChild('searchInput', {static: false}) searchInput: ElementRef;

  constructor(
    public sideNav: AppComponent,
    public dt: DateproviderService,
    private dataprovider: DataproviderService,
    private searchForm: ElementRef
  ) {
    this.searchItems = this.searchControl.valueChanges
      .pipe(
        startWith(''),
        map(event => event ? this.filterEvents(event) : this.events.slice())
      );
  }

  private filterEvents(value: string) {
    const filterValue = value.toLowerCase();
    return this.events.filter(event => event.title.toLowerCase().indexOf(filterValue) >= 0);
  }

  ngOnInit() {
    this.getActiveEvents();
  }

  toggleSidenav(): void {
    this.sideNav.toggleSidenav();
  }

  getActiveEvents() {
    this.dataprovider.getActiveEvents
      ().subscribe((data: {}) => {
        this.events = data;
      });
  }

  checkForClear(): void {
    this.sub = fromEvent<MouseEvent>(document, 'click')
      .pipe(
        filter(event => {
          return !this.searchForm.nativeElement.contains(event.target) && !(event.target instanceof HTMLSpanElement);
        }),
        take(1)
      ).subscribe(() => this.searchInput.nativeElement.value = '');
  }

  search(): void {
    if (this.dt.isValidDateString(this.searchInput.nativeElement.value)) {
      this.dt.setCurrentDate(new Date(this.searchInput.nativeElement.value));
    }
  }
}
