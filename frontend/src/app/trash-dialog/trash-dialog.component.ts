import { Component, OnInit } from '@angular/core';
import { DataproviderService } from '../dataprovider.service';
import { MatListOption } from '@angular/material/list';

@Component({
  selector: 'app-trash-dialog',
  templateUrl: './trash-dialog.component.html',
  styleUrls: ['./trash-dialog.component.css']
})
export class TrashDialogComponent implements OnInit {

  events: any = [];
  isLoading = true;

  constructor(private dataprovider: DataproviderService) { }

  ngOnInit() {
    this.trash();
  }

  trash() {
    this.dataprovider.trash
      ().subscribe((data: {}) => {
        this.events = data;
        this.isLoading = false;
      });
  }

  restoreEvent(eventsForRestore: MatListOption[]) {
    eventsForRestore.map(o => o.value).forEach(element => {
      this.dataprovider.restoreEvent(element).subscribe((data: {}) => {
      });
    });
    this.trash();
  }
}
