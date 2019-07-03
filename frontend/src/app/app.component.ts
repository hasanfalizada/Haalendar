import { Component, ViewChild, ElementRef } from '@angular/core';
import { MatSidenav } from '@angular/material';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'Haalendar';
  sideNavOpened = true;

  @ViewChild('sidenav') sidenav: MatSidenav;

  toggleSidenav(): void {
    this.sidenav.toggle();
  }
}
